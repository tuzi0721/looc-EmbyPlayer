#include "anime4k.h"

#include <QDir>
#include <QFileInfo>
#include <QtGlobal>

Anime4K::Anime4K(QObject *parent) : QObject(parent) {}

void Anime4K::setShaderDir(const QString &dir) { m_shaderDir = dir; }

const QMap<QString, QStringList> &Anime4K::chains() {
    // Official Anime4K v4 mode chains (file names only). See the upstream
    // "GLSL Instructions" — Mode A/B/C plus the heavier A+A/B+B/C+A combos and a
    // light x2 path for weak GPUs. T9b can extend this map without code changes
    // elsewhere.
    static const QMap<QString, QStringList> kChains = {
        {QStringLiteral("Off"), {}},
        {QStringLiteral("Fast"), {
            QStringLiteral("Anime4K_Clamp_Highlights.glsl"),
            QStringLiteral("Anime4K_Upscale_CNN_x2_S.glsl"),
        }},
        {QStringLiteral("A"), {
            QStringLiteral("Anime4K_Clamp_Highlights.glsl"),
            QStringLiteral("Anime4K_Restore_CNN_VL.glsl"),
            QStringLiteral("Anime4K_Upscale_CNN_x2_VL.glsl"),
            QStringLiteral("Anime4K_AutoDownscalePre_x2.glsl"),
            QStringLiteral("Anime4K_AutoDownscalePre_x4.glsl"),
            QStringLiteral("Anime4K_Upscale_CNN_x2_M.glsl"),
        }},
        {QStringLiteral("B"), {
            QStringLiteral("Anime4K_Clamp_Highlights.glsl"),
            QStringLiteral("Anime4K_Restore_CNN_Soft_VL.glsl"),
            QStringLiteral("Anime4K_Upscale_CNN_x2_VL.glsl"),
            QStringLiteral("Anime4K_AutoDownscalePre_x2.glsl"),
            QStringLiteral("Anime4K_AutoDownscalePre_x4.glsl"),
            QStringLiteral("Anime4K_Upscale_CNN_x2_M.glsl"),
        }},
        {QStringLiteral("C"), {
            QStringLiteral("Anime4K_Clamp_Highlights.glsl"),
            QStringLiteral("Anime4K_Upscale_Denoise_CNN_x2_VL.glsl"),
            QStringLiteral("Anime4K_AutoDownscalePre_x2.glsl"),
            QStringLiteral("Anime4K_AutoDownscalePre_x4.glsl"),
            QStringLiteral("Anime4K_Upscale_CNN_x2_M.glsl"),
        }},
        {QStringLiteral("A+A"), {
            QStringLiteral("Anime4K_Clamp_Highlights.glsl"),
            QStringLiteral("Anime4K_Restore_CNN_VL.glsl"),
            QStringLiteral("Anime4K_Upscale_CNN_x2_VL.glsl"),
            QStringLiteral("Anime4K_Restore_CNN_M.glsl"),
            QStringLiteral("Anime4K_AutoDownscalePre_x2.glsl"),
            QStringLiteral("Anime4K_AutoDownscalePre_x4.glsl"),
            QStringLiteral("Anime4K_Upscale_CNN_x2_M.glsl"),
        }},
        {QStringLiteral("B+B"), {
            QStringLiteral("Anime4K_Clamp_Highlights.glsl"),
            QStringLiteral("Anime4K_Restore_CNN_Soft_VL.glsl"),
            QStringLiteral("Anime4K_Upscale_CNN_x2_VL.glsl"),
            QStringLiteral("Anime4K_AutoDownscalePre_x2.glsl"),
            QStringLiteral("Anime4K_Restore_CNN_Soft_M.glsl"),
            QStringLiteral("Anime4K_AutoDownscalePre_x4.glsl"),
            QStringLiteral("Anime4K_Upscale_CNN_x2_M.glsl"),
        }},
        {QStringLiteral("C+A"), {
            QStringLiteral("Anime4K_Clamp_Highlights.glsl"),
            QStringLiteral("Anime4K_Upscale_Denoise_CNN_x2_VL.glsl"),
            QStringLiteral("Anime4K_AutoDownscalePre_x2.glsl"),
            QStringLiteral("Anime4K_AutoDownscalePre_x4.glsl"),
            QStringLiteral("Anime4K_Restore_CNN_M.glsl"),
            QStringLiteral("Anime4K_Upscale_CNN_x2_M.glsl"),
        }},
    };
    return kChains;
}

QStringList Anime4K::presets() const { return chains().keys(); }

QStringList Anime4K::shadersForPreset(const QString &preset) const {
    const auto it = chains().constFind(preset);
    if (it == chains().constEnd()) {
        return {};
    }
    QStringList out;
    const QDir dir(m_shaderDir);
    for (const QString &name : it.value()) {
        const QString path = dir.absoluteFilePath(name);
        if (QFileInfo::exists(path)) {
            out << path;
        } else {
            qWarning("anime4k: shader missing, skipping: %s", qUtf8Printable(path));
        }
    }
    return out;
}

void Anime4K::setActivePreset(const QString &preset) {
    if (m_preset == preset) {
        return;
    }
    m_preset = preset;
    emit presetChanged(m_preset);
}
