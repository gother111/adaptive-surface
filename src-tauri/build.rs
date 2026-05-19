fn main() {
    #[cfg(target_os = "macos")]
    {
        cc::Build::new()
            .file("src/native_helpers/eventkit_bridge.m")
            .flag("-fobjc-arc")
            .compile("eventkit_bridge");
        cc::Build::new()
            .file("src/native_helpers/contacts_bridge.m")
            .flag("-fobjc-arc")
            .compile("contacts_bridge");
        println!("cargo:rerun-if-changed=src/native_helpers/eventkit_bridge.m");
        println!("cargo:rerun-if-changed=src/native_helpers/contacts_bridge.m");
        println!("cargo:rustc-link-lib=framework=Contacts");
        println!("cargo:rustc-link-lib=framework=EventKit");
        println!("cargo:rustc-link-lib=framework=Foundation");
    }

    tauri_build::build()
}
