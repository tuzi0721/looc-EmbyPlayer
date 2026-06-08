use std::path::{Path, PathBuf};

use crate::config::models::Anime4kMode;
use crate::error::{AppError, AppResult};
use crate::mpv::paths::resolve_shader_dir;

impl Anime4kMode {
    pub fn label(self) -> &'static str {
        match self {
            Self::Off => "关闭",
            Self::ModeAFast => "Mode A 快",
            Self::ModeA => "Mode A",
            Self::ModeB => "Mode B",
            Self::ModeC => "Mode C",
            Self::High => "高质 (A+A)",
        }
    }

    fn shader_names(self) -> &'static [&'static str] {
        match self {
            Self::Off => &[],
            Self::ModeAFast => &[
                "Anime4K_Clamp_Highlights.glsl",
                "Anime4K_Restore_CNN_M.glsl",
                "Anime4K_AutoDownscalePre_x2.glsl",
                "Anime4K_AutoDownscalePre_x4.glsl",
                "Anime4K_Upscale_CNN_x2_M.glsl",
            ],
            Self::ModeA => &[
                "Anime4K_Clamp_Highlights.glsl",
                "Anime4K_Restore_CNN_VL.glsl",
                "Anime4K_Upscale_CNN_x2_VL.glsl",
                "Anime4K_AutoDownscalePre_x2.glsl",
                "Anime4K_AutoDownscalePre_x4.glsl",
                "Anime4K_Upscale_CNN_x2_M.glsl",
            ],
            Self::ModeB => &[
                "Anime4K_Clamp_Highlights.glsl",
                "Anime4K_Restore_CNN_Soft_VL.glsl",
                "Anime4K_Upscale_CNN_x2_VL.glsl",
                "Anime4K_AutoDownscalePre_x2.glsl",
                "Anime4K_AutoDownscalePre_x4.glsl",
                "Anime4K_Upscale_CNN_x2_M.glsl",
            ],
            Self::ModeC => &[
                "Anime4K_Clamp_Highlights.glsl",
                "Anime4K_Upscale_Denoise_CNN_x2_VL.glsl",
                "Anime4K_AutoDownscalePre_x2.glsl",
                "Anime4K_AutoDownscalePre_x4.glsl",
                "Anime4K_Upscale_CNN_x2_M.glsl",
            ],
            Self::High => &[
                "Anime4K_Clamp_Highlights.glsl",
                "Anime4K_Restore_CNN_VL.glsl",
                "Anime4K_Upscale_CNN_x2_VL.glsl",
                "Anime4K_AutoDownscalePre_x2.glsl",
                "Anime4K_AutoDownscalePre_x4.glsl",
                "Anime4K_Restore_CNN_M.glsl",
                "Anime4K_Upscale_CNN_x2_M.glsl",
            ],
        }
    }
}

pub fn resolve_mode_shader_paths(mode: Anime4kMode) -> AppResult<Vec<PathBuf>> {
    if mode == Anime4kMode::Off {
        return Ok(Vec::new());
    }
    let dir = resolve_shader_dir().ok_or_else(|| {
        AppError::Mpv("Anime4K shader directory not found in bundled resources".into())
    })?;
    let mut paths = Vec::with_capacity(mode.shader_names().len());
    for name in mode.shader_names() {
        let path = dir.join(name);
        if !path.is_file() {
            return Err(AppError::Mpv(format!(
                "Anime4K shader missing: {}",
                path.display()
            )));
        }
        paths.push(path);
    }
    Ok(paths)
}

/// mpv `change-list glsl-shaders` value: semicolon-separated absolute paths.
pub fn glsl_change_list_value(paths: &[PathBuf]) -> String {
    paths
        .iter()
        .map(|p| mpv_shader_path(p))
        .collect::<Vec<_>>()
        .join(";")
}

fn mpv_shader_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mode_a_fast_lists_expected_shaders() {
        assert_eq!(Anime4kMode::ModeAFast.shader_names().len(), 5);
        assert_eq!(Anime4kMode::High.shader_names().len(), 7);
    }
}
