# hills-player — self-developed Qt6/QML + libmpv player core (T9a/CH-3)
#
# Mirrors HillsLite's reference data/player/HillsPlayer.exe stack:
#   Qt6 (Quick / QuickControls2) + libmpv (render API) + QWindowKit (frameless)
#   + QCoro (coroutines), built with CMake on Windows (MSVC).
#
# Hard constraints (Hills Lite): bundle libmpv only, local-decode only, never
# transcode. The player is a standalone process; the Tauri/Electron host (T9c)
# launches it with mpv-style argv and reads HILLS_MPV_EVENT: JSON from stdout.
#
# Build (developer machine with Qt6 + libmpv dev):
#   cmake -S player -B player/build -G Ninja ^
#         -DCMAKE_PREFIX_PATH="C:/Qt/6.8.0/msvc2022_64" ^
#         -DMPV_ROOT="C:/dev/libmpv"          # contains include/mpv/*.h + mpv.lib
#   cmake --build player/build --config Release

cmake_minimum_required(VERSION 3.21)

project(hills_player
    VERSION 0.1.0
    DESCRIPTION "Hills Lite self-developed Qt6/QML + libmpv player"
    LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)

if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
    set(CMAKE_BUILD_TYPE Release CACHE STRING "" FORCE)
endif()

# ── Qt6 ─────────────────────────────────────────────────────────────────────
find_package(Qt6 REQUIRED COMPONENTS Core Gui OpenGL Qml Quick QuickControls2 Network)
qt_standard_project_setup(REQUIRES 6.5)

# ── libmpv ──────────────────────────────────────────────────────────────────
# Prefer pkg-config (Linux/MSYS); otherwise resolve from MPV_ROOT, finally fall
# back to the libmpv that already ships with emby-player (src-tauri/resources/mpv).
find_package(PkgConfig QUIET)
if(PkgConfig_FOUND)
    pkg_check_modules(MPV IMPORTED_TARGET mpv)
endif()

if(NOT MPV_FOUND)
    set(MPV_ROOT "" CACHE PATH "libmpv SDK root (contains include/mpv/*.h and mpv.lib)")
    set(_mpv_bundled "${CMAKE_CURRENT_SOURCE_DIR}/../src-tauri/resources/mpv")
    find_path(MPV_INCLUDE_DIR
        NAMES mpv/client.h mpv/render.h mpv/render_gl.h
        HINTS "${MPV_ROOT}/include" "${_mpv_bundled}/include")
    find_library(MPV_LIBRARY
        NAMES mpv libmpv mpv.dll.a libmpv.dll.a
        HINTS "${MPV_ROOT}" "${MPV_ROOT}/lib" "${_mpv_bundled}")
    if(NOT MPV_INCLUDE_DIR OR NOT MPV_LIBRARY)
        message(FATAL_ERROR
            "libmpv not found. Set -DMPV_ROOT=<sdk> with include/mpv/render_gl.h and mpv.lib. "
            "The bundled ${_mpv_bundled} has the runtime DLL/.lib but not the public headers; "
            "drop the libmpv dev headers there or point MPV_ROOT at an SDK.")
    endif()
    add_library(PkgConfig::MPV UNKNOWN IMPORTED)
    set_target_properties(PkgConfig::MPV PROPERTIES
        IMPORTED_LOCATION "${MPV_LIBRARY}"
        INTERFACE_INCLUDE_DIRECTORIES "${MPV_INCLUDE_DIR}")
endif()

# ── Optional: QWindowKit (frameless window) and QCoro (coroutines) ───────────
# These match the reference deployment (QWKCore/QWKQuick, QCoro6*). They are
# optional at build time so the core can compile before they are vendored:
# provide them via find_package (vcpkg/Qt) or FetchContent in the host build.
include(FetchContent)
find_package(QWindowKit QUIET COMPONENTS Quick)
if(NOT QWindowKit_FOUND)
    # We drive the frameless window from QML (QWK::QuickWindowAgent), so the Quick
    # module must be built; upstream defaults QWINDOWKIT_BUILD_QUICK to OFF, which
    # left QWindowKit::Quick absent and silently disabled the frameless feature.
    set(QWINDOWKIT_BUILD_QUICK ON CACHE BOOL "" FORCE)
    set(QWINDOWKIT_BUILD_WIDGETS OFF CACHE BOOL "" FORCE)
    set(QWINDOWKIT_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
    set(QWINDOWKIT_BUILD_TRANSLATIONS OFF CACHE BOOL "" FORCE)
    FetchContent_Declare(QWindowKit
        GIT_REPOSITORY https://github.com/stdware/qwindowkit.git
        GIT_TAG 1.5.0
        GIT_SHALLOW TRUE)
    FetchContent_MakeAvailable(QWindowKit)
    if(TARGET QWindowKit::Quick)
        set(QWindowKit_FOUND TRUE)
    endif()
endif()
find_package(QCoro6 QUIET COMPONENTS Core Qml)

qt_add_executable(hills_player WIN32
    src/main.cpp
    src/argv_options.cpp
    src/mpv_object.cpp
    src/reporter.cpp
    src/anime4k.cpp
    src/control_channel.cpp
)

qt_add_qml_module(hills_player
    URI HillsPlayer
    VERSION 1.0
    QML_FILES
        qml/Main.qml
)

target_include_directories(hills_player PRIVATE src)

target_link_libraries(hills_player PRIVATE
    Qt6::Core Qt6::Gui Qt6::OpenGL Qt6::Qml Qt6::Quick Qt6::QuickControls2 Qt6::Network
    PkgConfig::MPV
)

if(QWindowKit_FOUND)
    target_link_libraries(hills_player PRIVATE QWindowKit::Quick)
    target_compile_definitions(hills_player PRIVATE HILLS_HAVE_QWINDOWKIT=1)
endif()
if(QCoro6_FOUND)
    target_link_libraries(hills_player PRIVATE QCoro6::Core QCoro6::Qml)
    target_compile_definitions(hills_player PRIVATE HILLS_HAVE_QCORO=1)
endif()

# Anime4K official v4 GLSL shaders are resolved at runtime from this dir (next
# to the exe). Drop the official *.glsl files into player/shaders/anime4k/.
install(DIRECTORY shaders/ DESTINATION bin/shaders)
install(TARGETS hills_player RUNTIME DESTINATION bin)
