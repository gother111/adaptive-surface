use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

const MAX_INDEXED_ENTRIES: usize = 8_000;
const MAX_SEARCH_RESULTS: usize = 80;
const MAX_READ_BYTES: u64 = 1_000_000;
const PREVIEW_CHARS: usize = 8_000;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileSearchQuery {
    pub root: Option<String>,
    pub query: Option<String>,
    pub extension: Option<String>,
    pub modified_after_ms: Option<u64>,
    pub limit: Option<usize>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileReadQuery {
    pub path: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkFileRecord {
    pub id: String,
    pub path: String,
    pub name: String,
    pub extension: Option<String>,
    pub size: u64,
    pub modified_at: Option<u64>,
    pub root: String,
    pub readable_type: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileReadResult {
    pub file: WorkFileRecord,
    pub supported: bool,
    pub content_preview: String,
    pub chunks: Vec<String>,
    pub error: Option<String>,
}

#[tauri::command]
pub fn search_files(query: FileSearchQuery) -> Result<Vec<WorkFileRecord>, String> {
    let roots = trusted_roots()?;
    let selected_roots = query
        .root
        .as_deref()
        .map(|root| roots.iter().filter(|candidate| root_matches(candidate, root)).cloned().collect::<Vec<PathBuf>>())
        .filter(|items| !items.is_empty())
        .unwrap_or_else(|| roots.clone());
    let limit = query.limit.unwrap_or(MAX_SEARCH_RESULTS).clamp(1, MAX_SEARCH_RESULTS);
    let query_text = query.query.unwrap_or_default().to_lowercase();
    let extension = query
        .extension
        .map(|value| value.trim_start_matches('.').to_lowercase())
        .filter(|value| !value.is_empty());
    let mut results = Vec::new();
    let mut scanned = 0usize;

    for root in selected_roots {
        scan_root(&root, &root, &query_text, extension.as_deref(), query.modified_after_ms, limit, &mut scanned, &mut results)?;
        if results.len() >= limit || scanned >= MAX_INDEXED_ENTRIES {
            break;
        }
    }

    results.sort_by(|left, right| right.modified_at.cmp(&left.modified_at).then_with(|| left.name.cmp(&right.name)));
    results.truncate(limit);
    Ok(results)
}

#[tauri::command]
pub fn read_file(query: FileReadQuery) -> Result<FileReadResult, String> {
    let path = PathBuf::from(&query.path);
    let root = trusted_root_for_path(&path).ok_or_else(|| "File is outside Desktop, Documents, and Downloads trusted roots.".to_string())?;
    let metadata = fs::metadata(&path).map_err(|error| format!("Failed to read file metadata: {error}"))?;
    if !metadata.is_file() {
        return Err("Path is not a file.".to_string());
    }

    let record = record_from_path(&path, &root, &metadata)?;
    if metadata.len() > MAX_READ_BYTES {
        return Ok(FileReadResult {
            file: record,
            supported: false,
            content_preview: String::new(),
            chunks: Vec::new(),
            error: Some(format!("File is too large for safe preview: {} bytes.", metadata.len())),
        });
    }

    if !is_supported_text_extension(record.extension.as_deref()) {
        return Ok(FileReadResult {
            file: record,
            supported: false,
            content_preview: String::new(),
            chunks: Vec::new(),
            error: Some("This file type is indexed but not readable in this milestone.".to_string()),
        });
    }

    let contents = fs::read_to_string(&path).map_err(|error| format!("Failed to read file contents: {error}"))?;
    let preview = contents.chars().take(PREVIEW_CHARS).collect::<String>();
    let chunks = chunk_text(&preview, 1200);

    Ok(FileReadResult {
        file: record,
        supported: true,
        content_preview: preview,
        chunks,
        error: None,
    })
}

fn scan_root(
    root: &Path,
    dir: &Path,
    query_text: &str,
    extension: Option<&str>,
    modified_after_ms: Option<u64>,
    limit: usize,
    scanned: &mut usize,
    results: &mut Vec<WorkFileRecord>,
) -> Result<(), String> {
    if *scanned >= MAX_INDEXED_ENTRIES || results.len() >= limit {
        return Ok(());
    }

    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return Ok(()),
    };

    for entry in entries.flatten() {
        if *scanned >= MAX_INDEXED_ENTRIES || results.len() >= limit {
            break;
        }

        let path = entry.path();
        if should_skip_path(&path) {
            continue;
        }

        *scanned += 1;
        let Ok(metadata) = entry.metadata() else {
            continue;
        };

        if metadata.is_dir() {
            scan_root(root, &path, query_text, extension, modified_after_ms, limit, scanned, results)?;
            continue;
        }

        if !metadata.is_file() {
            continue;
        }

        let record = record_from_path(&path, root, &metadata)?;
        if let Some(ext) = extension {
            if record.extension.as_deref() != Some(ext) {
                continue;
            }
        }

        if !query_text.is_empty() && !record.name.to_lowercase().contains(query_text) && !record.path.to_lowercase().contains(query_text) {
            continue;
        }

        if let Some(modified_after) = modified_after_ms {
            if record.modified_at.unwrap_or(0) < modified_after {
                continue;
            }
        }

        results.push(record);
    }

    Ok(())
}

fn record_from_path(path: &Path, root: &Path, metadata: &fs::Metadata) -> Result<WorkFileRecord, String> {
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("(unnamed)")
        .to_string();
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_lowercase());

    Ok(WorkFileRecord {
        id: format!("file-{}", path.display()),
        path: path.display().to_string(),
        name,
        extension: extension.clone(),
        size: metadata.len(),
        modified_at: metadata.modified().ok().map(system_time_to_epoch_ms),
        root: root.display().to_string(),
        readable_type: readable_type(extension.as_deref()).to_string(),
    })
}

fn trusted_roots() -> Result<Vec<PathBuf>, String> {
    let home = std::env::var("HOME").map_err(|_| "HOME is unavailable; cannot resolve trusted roots.".to_string())?;
    Ok(["Desktop", "Documents", "Downloads"]
        .iter()
        .map(|name| PathBuf::from(&home).join(name))
        .filter(|path| path.is_dir())
        .collect())
}

fn trusted_root_for_path(path: &Path) -> Option<PathBuf> {
    let canonical = path.canonicalize().ok()?;
    trusted_roots()
        .ok()?
        .into_iter()
        .filter_map(|root| root.canonicalize().ok())
        .find(|root| canonical.starts_with(root))
}

fn root_matches(path: &Path, requested: &str) -> bool {
    let requested = requested.to_lowercase();
    path.file_name()
        .and_then(|value| value.to_str())
        .map(|name| name.to_lowercase() == requested)
        .unwrap_or(false)
        || path.display().to_string().to_lowercase() == requested
}

fn should_skip_path(path: &Path) -> bool {
    path.file_name()
        .and_then(|value| value.to_str())
        .map(|name| name.starts_with('.') || name == "Library" || name == "node_modules" || name == "target")
        .unwrap_or(false)
}

fn is_supported_text_extension(extension: Option<&str>) -> bool {
    matches!(extension, Some("txt" | "md" | "json" | "csv" | "html" | "htm"))
}

fn readable_type(extension: Option<&str>) -> &'static str {
    match extension {
        Some("txt" | "md" | "json" | "csv" | "html" | "htm") => "text",
        Some("pdf") => "pdf-indexed-unsupported",
        Some("docx") => "docx-indexed-unsupported",
        Some("xlsx") => "xlsx-indexed-unsupported",
        _ => "metadata-only",
    }
}

fn chunk_text(value: &str, chunk_size: usize) -> Vec<String> {
    let chars = value.chars().collect::<Vec<char>>();
    chars
        .chunks(chunk_size)
        .map(|chunk| chunk.iter().collect::<String>())
        .collect()
}

fn system_time_to_epoch_ms(value: SystemTime) -> u64 {
    value
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}
