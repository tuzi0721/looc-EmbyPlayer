use std::env;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

/// Pinned mpv Windows x64 build (zhongfly/mpv-winbuild).
const MPV_7Z_URL: &str = "https://github.com/zhongfly/mpv-winbuild/releases/download/2026-05-20-7d603534de/mpv-x86_64-20260520-git-7d603534de.7z";

fn main() {
    ensure_frontend_dist();
    tauri_build::build();

    #[cfg(target_os = "windows")]
    {
        if let Err(e) = ensure_mpv_windows() {
            println!("cargo:warning=mpv bootstrap: {e}");
        }
    }
}

#[cfg(target_os = "windows")]
fn ensure_mpv_windows() -> io::Result<()> {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").map_err(|e| io::Error::other(e))?);
    let vendor = manifest_dir.join("vendor").join("mpv");
    let mpv_exe = vendor.join("mpv.exe");

    println!("cargo:rerun-if-env-changed=HILLS_LITE_MPV_DIR");
    println!("cargo:rerun-if-changed=vendor/mpv/mpv.exe");

    if !mpv_exe.is_file() {
        if let Ok(local) = env::var("HILLS_LITE_MPV_DIR") {
            copy_tree(Path::new(&local), &vendor)?;
        } else {
            download_mpv_7z(&vendor)?;
        }
    }

    // Dev/release runtime: copy beside binary as resources/mpv/
    if let Ok(out_dir) = env::var("OUT_DIR") {
        if let Some(target_dir) = PathBuf::from(&out_dir).ancestors().nth(3) {
            let dest = target_dir.join("resources").join("mpv");
            copy_tree(&vendor, &dest)?;
        }
    }

    Ok(())
}

#[cfg(target_os = "windows")]
fn download_mpv_7z(dest: &Path) -> io::Result<()> {
    fs::create_dir_all(dest)?;

    let cache_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap()).join("vendor");
    fs::create_dir_all(&cache_dir)?;
    let archive = cache_dir.join("mpv-win-x86_64.7z");

    if !archive.is_file() {
        eprintln!("Downloading mpv from {MPV_7Z_URL} …");
        let client = reqwest::blocking::Client::builder()
            .user_agent("Hills-Lite-Build/0.1")
            .build()
            .map_err(io::Error::other)?;
        let bytes = client
            .get(MPV_7Z_URL)
            .send()
            .map_err(io::Error::other)?
            .bytes()
            .map_err(io::Error::other)?;
        fs::write(&archive, &bytes)?;
    }

    let extract_root = cache_dir.join("mpv-extract");
    if extract_root.exists() {
        let _ = fs::remove_dir_all(&extract_root);
    }
    fs::create_dir_all(&extract_root)?;

    sevenz_rust::decompress_file(archive.to_str().unwrap(), extract_root.to_str().unwrap())
        .map_err(io::Error::other)?;

    // The 7z root contains mpv.exe directly or one level deep.
    if let Some(src) = find_mpv_dir(&extract_root) {
        copy_tree(&src, dest)?;
    } else {
        return Err(io::Error::new(
            io::ErrorKind::NotFound,
            "mpv.exe not found inside downloaded archive",
        ));
    }

    Ok(())
}

fn find_mpv_dir(root: &Path) -> Option<PathBuf> {
    let direct = root.join("mpv.exe");
    if direct.is_file() {
        return Some(root.to_path_buf());
    }
    if let Ok(entries) = fs::read_dir(root) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.join("mpv.exe").is_file() {
                return Some(p);
            }
        }
    }
    None
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
