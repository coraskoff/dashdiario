use tauri_plugin_sql::{Migration, MigrationKind};

#[derive(serde::Serialize)]
struct ActiveApp {
    process: String,
    app: String,
    title: String,
}

/// Retorna o app/janela em primeiro plano no sistema (foreground).
/// Usado pelo modo Fluxo pra saber se você saiu dos apps de trabalho.
#[tauri::command]
fn active_app() -> Option<ActiveApp> {
    match active_win_pos_rs::get_active_window() {
        Ok(w) => {
            let process = w
                .process_path
                .file_name()
                .map(|n| n.to_string_lossy().to_lowercase())
                .unwrap_or_default();
            Some(ActiveApp {
                process,
                app: w.app_name,
                title: w.title,
            })
        }
        Err(_) => None,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![Migration {
        version: 1,
        description: "create initial schema",
        sql: include_str!("../migrations/0001_init.sql"),
        kind: MigrationKind::Up,
    }];

    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:dash.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![active_app])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
