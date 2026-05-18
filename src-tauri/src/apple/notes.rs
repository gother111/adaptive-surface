use super::models::{AppleCommandResult, AppleNoteDetail, AppleNotePreview, CreateNoteRequest, NotesQuery};
use crate::providers::notes_provider;

pub fn load_notes(query: NotesQuery) -> Result<Vec<AppleNotePreview>, String> {
    notes_provider::list(query).map_err(|error| error.message())
}

pub fn read_note(id: String) -> Result<AppleNoteDetail, String> {
    notes_provider::read(id).map_err(|error| error.message())
}

pub fn create_note(request: CreateNoteRequest) -> Result<AppleCommandResult, String> {
    notes_provider::create(request).map_err(|error| error.message())
}
