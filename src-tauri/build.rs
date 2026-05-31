use std::env;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

fn main() {
    ensure_frontend_dist();
    tauri_build::build();

    #[cfg(target_os = "windows")]
    {
        if let Err(e) = ensure_mpv_windows() {
            panic!("bundled mpv copy failed: {e}");
        }
    }
}

#[cfg(target_os = "windows")]
fn ensure_mpv_windows() -> io::Result<()> {
    let manifest_dir =
        PathBuf::from(env::var("CARGO_MANIFEST_DIR").map_err(|e| io::Error::other(e))?);
    let bundled = manifest_dir.join("resources").join("mpv");
    let mpv_exe = bundled.join("mpv.exe");

    println!("cargo:rerun-if-changed=resources/mpv/mpv.exe");
    println!("cargo:rerun-if-changed=resources/mpv/libmpv-2.dll");
    println!("cargo:rerun-if-changed=resources/mpv/d3dcompiler_43.dll");
    println!("cargo:rerun-if-changed=resources/mpv/mpv/fonts.conf");

    if !mpv_exe.is_file() {
        return Err(io::Error::new(
            io::ErrorKind::NotFound,
            format!("bundled mpv.exe missing: {}", mpv_exe.display()),
        ));
    }

    // Dev/release runtime: copy beside binary as resources/mpv/
    if let Ok(out_dir) = env::var("OUT_DIR") {
        if let Some(target_dir) = PathBuf::from(&out_dir).ancestors().nth(3) {
            let dest = target_dir.join("resources").join("mpv");
            if dest.exists() {
                fs::remove_dir_all(&dest)?;
            }
            copy_tree(&bundled, &dest)?;
        }
    }

    Ok(())
}

fn copy_tree(src: &Path, dest: &Path) -> io::Result<()> {
    if !src.is_dir() {
        return Err(io::Error::new(
            io::ErrorKind::NotFound,
            format!("source dir missing: {}", src.display()),
        ));
    }
    fs::create_dir_all(dest)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let from = entry.path();
        let to = dest.join(entry.file_name());
        if ty.is_dir() {
            copy_tree(&from, &to)?;
        } else if ty.is_file() {
            fs::copy(&from, &to)?;
        }
    }
    Ok(())
}

/// Release builds embed `../dist`. `cargo build --release` alone skips
/// `beforeBuildCommand`; without dist the app falls back to dev localhost.
fn ensure_frontend_dist() {
    let profile = env::var("PROFILE").unwrap_or_default();
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap_or_default());
    let dist_index = manifest_dir.join("../dist/index.html");

    println!("cargo:rerun-if-changed=../dist/index.html");

    if profile == "release" && !dist_index.is_file() {
        panic!(
            "\n\n[Hills Lite] release 构建缺少前端 dist。\n\
             请先: cd {} && npm run build\n\
             或: npm run tauri:build\n\
             勿只跑 cargo build --release，否则会连 localhost:1420 报拒绝连接。\n",
            manifest_dir.join("..").display()
        );
    }
}
