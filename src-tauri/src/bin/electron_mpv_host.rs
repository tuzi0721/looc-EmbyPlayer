use std::io::{self, BufRead, Write};
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

use serde::Deserialize;
use windows::core::PCWSTR;
use windows::Win32::Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::Graphics::Gdi::{
    BeginPaint, EndPaint, GetStockObject, BLACK_BRUSH, HBRUSH, PAINTSTRUCT,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, PeekMessageW, RegisterClassW,
    SetWindowPos, ShowWindow, TranslateMessage, CS_HREDRAW, CS_VREDRAW, CW_USEDEFAULT, HMENU,
    HWND_TOP, MSG, PM_REMOVE, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SW_HIDE, SW_SHOW,
    WNDCLASSW, WS_CHILD, WS_CLIPCHILDREN, WS_CLIPSIBLINGS,
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

fn apply_rect(hwnd: HWND, x: f64, y: f64, width: f64, height: f64, scale: f64, top: bool) {
    let scale = if scale.is_finite() && scale > 0.0 {
        scale
    } else {
        1.0
    };
    let x = (x * scale).round() as i32;
    let y = (y * scale).round() as i32;
    let width = (width * scale).round().max(1.0) as i32;
    let height = (height * scale).round().max(1.0) as i32;
    let _ = top;
    unsafe {
        let _ = SetWindowPos(hwnd, HWND_TOP, x, y, width, height, SWP_NOACTIVATE);
    }
}

fn apply_z_order(hwnd: HWND, top: bool) {
    let _ = top;
    unsafe {
        let _ = SetWindowPos(
            hwnd,
            HWND_TOP,
            0,
            0,
            0,
            0,
            SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE,
        );
    }
}

fn main() -> anyhow::Result<()> {
    let parent = std::env::args()
        .nth(1)
        .ok_or_else(|| anyhow::anyhow!("missing parent hwnd"))?
        .parse::<isize>()?;
    let hwnd = create_host_window(HWND(parent as *mut _))?;
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
                    apply_rect(hwnd, x, y, width, height, scale, top);
                }
                HostCommand::Visible { visible } => unsafe {
                    let _ = ShowWindow(hwnd, if visible { SW_SHOW } else { SW_HIDE });
                    if visible {
                        apply_z_order(hwnd, last_top);
                    }
                },
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
