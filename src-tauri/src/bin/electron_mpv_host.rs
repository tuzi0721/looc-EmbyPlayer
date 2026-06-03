use std::io::{self, BufRead, Write};
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

use serde::Deserialize;
use windows::core::PCWSTR;
use windows::Win32::Foundation::{BOOL, HINSTANCE, HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::Graphics::Gdi::{
    BeginPaint, EndPaint, GetStockObject, UpdateWindow, BLACK_BRUSH, HBRUSH, PAINTSTRUCT,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, EnumWindows,
    GetWindowLongPtrW, GetWindowThreadProcessId, IsWindowVisible, PeekMessageW, RegisterClassW,
    SetParent, SetWindowLongPtrW, SetWindowPos, ShowWindow, TranslateMessage, CS_HREDRAW,
    CS_VREDRAW, CW_USEDEFAULT, GWL_STYLE, HMENU, HWND_TOP, MSG, PM_REMOVE, SWP_FRAMECHANGED,
    SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW, SW_HIDE, SW_SHOW, WNDCLASSW, WS_CHILD,
    WS_CLIPCHILDREN, WS_CLIPSIBLINGS, WS_POPUP, WS_VISIBLE,
};

const CLASS_NAME: &str = "HillsLiteElectronMpvHost\0";
const WM_ERASEBKGND: u32 = 0x0014;
const WM_NCHITTEST: u32 = 0x0084;
const WM_PAINT: u32 = 0x000F;
const HTTRANSPARENT: isize = -1;

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum HostCommand {
    Rect {
        x: f64,
        y: f64,
        width: f64,
        height: f64,
        #[serde(default = "default_scale")]
        scale: f64,
        #[serde(default)]
        top: bool,
    },
    Visible {
        visible: bool,
    },
    AttachMpv {
        pid: u32,
        #[serde(default)]
        target: Option<String>,
    },
    Destroy,
}

fn default_scale() -> f64 {
    1.0
}

fn wide(value: &str) -> Vec<u16> {
    value.encode_utf16().collect()
}

unsafe extern "system" fn wnd_proc(
    hwnd: HWND,
    msg: u32,
    _wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    if msg == WM_ERASEBKGND {
        return LRESULT(1);
    }
    if msg == WM_PAINT {
        let mut ps = PAINTSTRUCT::default();
        let _hdc = BeginPaint(hwnd, &mut ps);
        let _ = EndPaint(hwnd, &ps);
        return LRESULT(0);
    }
    if msg == WM_NCHITTEST {
        return LRESULT(HTTRANSPARENT);
    }
    DefWindowProcW(hwnd, msg, _wparam, lparam)
}

fn register_class() {
    let class_name = wide(CLASS_NAME);
    let brush = unsafe { HBRUSH(GetStockObject(BLACK_BRUSH).0) };
    let wc = WNDCLASSW {
        style: CS_HREDRAW | CS_VREDRAW,
        lpfnWndProc: Some(wnd_proc),
        hInstance: HINSTANCE::default(),
        hbrBackground: brush,
        lpszClassName: PCWSTR(class_name.as_ptr()),
        ..Default::default()
    };
    unsafe {
        let _ = RegisterClassW(&wc);
    }
}

fn create_host_window(parent: HWND) -> windows::core::Result<HWND> {
    register_class();
    let class_name = wide(CLASS_NAME);
    unsafe {
        CreateWindowExW(
            Default::default(),
            PCWSTR(class_name.as_ptr()),
            PCWSTR::null(),
            WS_CHILD | WS_CLIPCHILDREN | WS_CLIPSIBLINGS,
            CW_USEDEFAULT,
            CW_USEDEFAULT,
            640,
            360,
            parent,
            HMENU::default(),
            HINSTANCE::default(),
            None,
        )
    }
}

fn scaled_rect(x: f64, y: f64, width: f64, height: f64, scale: f64) -> (i32, i32, i32, i32) {
    let scale = if scale.is_finite() && scale > 0.0 {
        scale
    } else {
        1.0
    };
    let x = (x * scale).round() as i32;
    let y = (y * scale).round() as i32;
    let width = (width * scale).round().max(1.0) as i32;
    let height = (height * scale).round().max(1.0) as i32;
    (x, y, width, height)
}

fn apply_rect(
    hwnd: HWND,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    scale: f64,
    top: bool,
) -> (i32, i32, i32, i32) {
    let (x, y, width, height) = scaled_rect(x, y, width, height, scale);
    let _ = top;
    unsafe {
        let _ = ShowWindow(hwnd, SW_SHOW);
        let _ = SetWindowPos(
            hwnd,
            HWND_TOP,
            x,
            y,
            width,
            height,
            SWP_NOACTIVATE | SWP_SHOWWINDOW,
        );
        let _ = UpdateWindow(hwnd);
    }
    (x, y, width, height)
}

fn resize_attached_mpv(hwnd: HWND, x: i32, y: i32, width: i32, height: i32, visible: bool) {
    unsafe {
        let _ = ShowWindow(hwnd, if visible { SW_SHOW } else { SW_HIDE });
        if visible {
            let _ = SetWindowPos(
                hwnd,
                HWND_TOP,
                x,
                y,
                width.max(1),
                height.max(1),
                SWP_NOACTIVATE | SWP_SHOWWINDOW | SWP_FRAMECHANGED,
            );
            let _ = UpdateWindow(hwnd);
        }
    }
}

#[derive(Clone, Copy)]
struct AttachedMpv {
    hwnd: HWND,
    target_parent: bool,
}

fn apply_z_order(
    hwnd: HWND,
    top: bool,
    attached_mpv: Option<AttachedMpv>,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
) {
    let _ = top;
    unsafe {
        let _ = ShowWindow(hwnd, SW_SHOW);
        let _ = SetWindowPos(
            hwnd,
            HWND_TOP,
            0,
            0,
            0,
            0,
            SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW,
        );
        let _ = UpdateWindow(hwnd);
    }
    if let Some(mpv_hwnd) = attached_mpv {
        let (mpv_x, mpv_y) = if mpv_hwnd.target_parent {
            (x, y)
        } else {
            (0, 0)
        };
        resize_attached_mpv(mpv_hwnd.hwnd, mpv_x, mpv_y, width, height, true);
    }
}

struct FindWindowContext {
    pid: u32,
    hwnd: HWND,
}

unsafe extern "system" fn find_window_for_pid(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let context = &mut *(lparam.0 as *mut FindWindowContext);
    let mut window_pid = 0;
    GetWindowThreadProcessId(hwnd, Some(&mut window_pid));
    if window_pid == context.pid && IsWindowVisible(hwnd).as_bool() {
        context.hwnd = hwnd;
        return BOOL(0);
    }
    BOOL(1)
}

fn locate_window_for_pid(pid: u32) -> Option<HWND> {
    for _ in 0..50 {
        let mut context = FindWindowContext {
            pid,
            hwnd: HWND::default(),
        };
        unsafe {
            let _ = EnumWindows(
                Some(find_window_for_pid),
                LPARAM((&mut context as *mut FindWindowContext) as isize),
            );
        }
        if !context.hwnd.0.is_null() {
            return Some(context.hwnd);
        }
        thread::sleep(Duration::from_millis(100));
    }
    None
}

fn attach_mpv_to_host(
    parent_hwnd: HWND,
    host_hwnd: HWND,
    pid: u32,
    target_parent: bool,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
    visible: bool,
) -> Option<AttachedMpv> {
    let mpv_hwnd = locate_window_for_pid(pid)?;
    let target_hwnd = if target_parent {
        parent_hwnd
    } else {
        host_hwnd
    };
    unsafe {
        let _ = SetParent(mpv_hwnd, target_hwnd);
        let style = GetWindowLongPtrW(mpv_hwnd, GWL_STYLE);
        let next_style = (style & !(WS_POPUP.0 as isize))
            | (WS_CHILD.0 | WS_CLIPSIBLINGS.0 | WS_VISIBLE.0) as isize;
        let _ = SetWindowLongPtrW(mpv_hwnd, GWL_STYLE, next_style);
    }
    let (mpv_x, mpv_y) = if target_parent { (x, y) } else { (0, 0) };
    resize_attached_mpv(mpv_hwnd, mpv_x, mpv_y, width, height, visible);
    Some(AttachedMpv {
        hwnd: mpv_hwnd,
        target_parent,
    })
}

fn main() -> anyhow::Result<()> {
    let parent = std::env::args()
        .nth(1)
        .ok_or_else(|| anyhow::anyhow!("missing parent hwnd"))?
        .parse::<isize>()?;
    let parent_hwnd = HWND(parent as *mut _);
    let hwnd = create_host_window(parent_hwnd)?;
    println!(r#"{{"type":"ready","hwnd":{}}}"#, hwnd.0 as isize);
    io::stdout().flush()?;

    let (tx, rx) = mpsc::channel::<HostCommand>();
    thread::spawn(move || {
        for line in io::stdin().lock().lines().map_while(Result::ok) {
            if line.trim().is_empty() {
                continue;
            }
            if let Ok(command) = serde_json::from_str::<HostCommand>(&line) {
                let should_stop = matches!(command, HostCommand::Destroy);
                let _ = tx.send(command);
                if should_stop {
                    break;
                }
            }
        }
    });

    let mut running = true;
    let mut last_top = false;
    let mut last_x = 0;
    let mut last_y = 0;
    let mut last_width = 640;
    let mut last_height = 360;
    let mut last_visible = true;
    let mut attached_mpv: Option<AttachedMpv> = None;
    while running {
        let mut message = MSG::default();
        unsafe {
            while PeekMessageW(&mut message, HWND::default(), 0, 0, PM_REMOVE).as_bool() {
                let _ = TranslateMessage(&message);
                DispatchMessageW(&message);
            }
        }

        while let Ok(command) = rx.try_recv() {
            match command {
                HostCommand::Rect {
                    x,
                    y,
                    width,
                    height,
                    scale,
                    top,
                } => {
                    last_top = top;
                    let (x, y, width, height) = apply_rect(hwnd, x, y, width, height, scale, top);
                    last_x = x;
                    last_y = y;
                    last_width = width;
                    last_height = height;
                    if let Some(mpv_hwnd) = attached_mpv {
                        let (mpv_x, mpv_y) = if mpv_hwnd.target_parent {
                            (last_x, last_y)
                        } else {
                            (0, 0)
                        };
                        resize_attached_mpv(
                            mpv_hwnd.hwnd,
                            mpv_x,
                            mpv_y,
                            last_width,
                            last_height,
                            last_visible,
                        );
                    }
                }
                HostCommand::Visible { visible } => unsafe {
                    last_visible = visible;
                    let _ = ShowWindow(hwnd, if visible { SW_SHOW } else { SW_HIDE });
                    if visible {
                        apply_z_order(
                            hwnd,
                            last_top,
                            attached_mpv,
                            last_x,
                            last_y,
                            last_width,
                            last_height,
                        );
                    } else if let Some(mpv_hwnd) = attached_mpv {
                        let _ = ShowWindow(mpv_hwnd.hwnd, SW_HIDE);
                    }
                },
                HostCommand::AttachMpv { pid, target } => {
                    let target_parent = target.as_deref() == Some("parent");
                    let attached = attach_mpv_to_host(
                        parent_hwnd,
                        hwnd,
                        pid,
                        target_parent,
                        last_x,
                        last_y,
                        last_width,
                        last_height,
                        last_visible,
                    );
                    if let Some(attached) = attached {
                        attached_mpv = Some(attached);
                        println!(
                            r#"{{"type":"attached_mpv","hwnd":{},"pid":{},"target":"{}"}}"#,
                            attached.hwnd.0 as isize,
                            pid,
                            if attached.target_parent {
                                "parent"
                            } else {
                                "host"
                            }
                        );
                        let _ = io::stdout().flush();
                    } else {
                        println!(
                            r#"{{"type":"attach_failed","pid":{},"target":"{}"}}"#,
                            pid,
                            if target_parent { "parent" } else { "host" }
                        );
                        let _ = io::stdout().flush();
                    }
                }
                HostCommand::Destroy => running = false,
            }
        }

        thread::sleep(Duration::from_millis(8));
    }

    unsafe {
        let _ = DestroyWindow(hwnd);
    }
    Ok(())
}
