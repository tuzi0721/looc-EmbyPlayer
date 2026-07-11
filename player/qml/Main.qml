import QtQuick
import QtQuick.Window
import QtQuick.Controls.Basic
import QtQuick.Layouts
import HillsPlayer

// HillsLite player-page replication (docs/UI_REFERENCE_HILLS_LITE.md 图2/3).
// The video is a normal Qt Quick item (MpvObject, libmpv render API), so all
// controls overlay it directly — no native child window, no dead zones.
//
// Controls use CH-2's SVG icon set (qml/icons/*.svg, bundled into the QML
// module); the speed button shows the live multiplier as text. Every control
// is functional: transport/seek/volume/speed/tracks/zoom/Anime4K/subtitle
// settings/stats work against mpv directly, and shell-domain intents
// (versions/episodes/danmaku) are forwarded to the host via ui-action events.
Window {
    id: win
    width: 1280
    height: 720
    // Floor the window size so the bottom control cluster never collapses /
    // clips: the transport + right cluster need ~720px to lay out on one row.
    minimumWidth: 720
    minimumHeight: 420
    visible: true
    color: "black"
    title: qsTr("Hills Player")

    // ── theme (spec: dark #121212/#1e1e1e, purple accent) ───────────────────
    readonly property color accent: "#7c4dff"
    readonly property color accentHover: "#9e7cff"
    readonly property color menuBg: "#f01e1e1e"
    readonly property color menuHover: "#33ffffff"

    property bool controlsVisible: true
    property bool pinned: false
    property bool netSpeedVisible: false
    property string mediaTitle: win.title
    property int volumeValue: 100

    function fmt(t) {
        if (!t || t < 0 || isNaN(t)) t = 0;
        t = Math.floor(t);
        var h = Math.floor(t / 3600);
        var m = Math.floor((t % 3600) / 60);
        var s = t % 60;
        function p(n) { return (n < 10 ? "0" : "") + n; }
        return h > 0 ? (h + ":" + p(m) + ":" + p(s)) : (p(m) + ":" + p(s));
    }
    function reveal() { controlsVisible = true; hideTimer.restart(); }
    // Single-click on the video toggles the chrome: show it (and arm auto-hide) when
    // hidden, hide it immediately when already shown.
    function toggleControls() {
        if (controlsVisible) {
            controlsVisible = false;
            hideTimer.stop();
        } else {
            reveal();
        }
    }
    // The top-left title shows mpv's media-title. When the host doesn't pass a
    // real title, media-title falls back to the raw stream URL (…/Videos/stream?
    // MediaSourceId=…) — which must NOT be shown. Hide anything that looks like a
    // URL/stream id and keep only a clean human title.
    function displayTitle() {
        var t = String(win.mediaTitle || "");
        if (t.length === 0) return "";
        if (/^[a-z]+:\/\//i.test(t)) return "";          // http(s)://, file://…
        if (/\/Videos\/|MediaSourceId|PlaySessionId|stream\?|api_key=/i.test(t)) return "";
        return t;
    }
    function toggleFullScreen() {
        win.visibility = (win.visibility === Window.FullScreen)
            ? Window.Windowed : Window.FullScreen;
    }
    function toggleMaximize() {
        // From either Maximized OR FullScreen, restore straight to Windowed in one
        // click. Standalone playback now launches FullScreen, and the old toggle
        // (Maximized?Windowed:Maximized) needed two clicks from fullscreen
        // (fullscreen→maximized→windowed).
        win.visibility = (win.visibility === Window.Maximized
                          || win.visibility === Window.FullScreen)
            ? Window.Windowed : Window.Maximized;
    }
    function togglePinned() {
        pinned = !pinned;
        win.flags = pinned ? (win.flags | Qt.WindowStaysOnTopHint)
                           : (win.flags & ~Qt.WindowStaysOnTopHint);
    }
    function hostAction(action, label) {
        mpv.uiAction(action);
        toast.show(label + qsTr(" 已交由宿主处理"));
    }
    // Render a host-pushed selection panel (episodes / versions / quality). The
    // host gathers the list over IPC (it owns the Emby session) and sends it via
    // MpvObject.hostPanelRequested; we map it into the shared hostMenu and pop it
    // above the matching button. Picking a row reports the selection back so the
    // host reloads playback with the chosen episode / media source.
    function showHostPanel(panel) {
        if (!panel)
            return;
        var kind = panel.kind || "";
        var entries = (panel.entries || []).map(function (e) {
            return {
                label: (e.sublabel && String(e.sublabel).length > 0)
                       ? (e.label + "   ·   " + e.sublabel) : e.label,
                checked: e.checked === true,
                trigger: function () { mpv.uiAction("panel-select", { kind: kind, key: e.key }); }
            };
        });
        if (entries.length === 0)
            entries = [{ label: qsTr("无可选项"), checked: false, trigger: function () {} }];
        hostMenu.entries = entries;
        var anchor = kind === "versions" ? versionBtn
                   : kind === "quality" ? qualityBtn : episodesBtn;
        win.reveal();
        win.popupAbove(hostMenu, anchor);
    }
    function applyZoomMode(mode) {
        // 适应 / 填充 / 拉伸 / 原始 (mpv keepaspect / panscan / video-unscaled)
        if (mode === "fill") {
            mpv.setProperty("video-unscaled", "no");
            mpv.setProperty("keepaspect", "yes");
            mpv.setProperty("panscan", "1.0");
        } else if (mode === "stretch") {
            mpv.setProperty("video-unscaled", "no");
            mpv.setProperty("panscan", "0");
            mpv.setProperty("keepaspect", "no");
        } else if (mode === "original") {
            mpv.setProperty("keepaspect", "yes");
            mpv.setProperty("panscan", "0");
            mpv.setProperty("video-unscaled", "yes");
        } else { // fit
            mpv.setProperty("video-unscaled", "no");
            mpv.setProperty("keepaspect", "yes");
            mpv.setProperty("panscan", "0");
        }
        settingsMenu.zoomMode = mode;
    }
    // track-list -> [{id,title,lang,selected}] for the audio/sub menus.
    function tracksOf(kind) {
        var out = [];
        var list = mpv.getProperty("track-list");
        if (!list) return out;
        for (var i = 0; i < list.length; ++i) {
            var t = list[i];
            if (t.type !== kind) continue;
            var label = (t.title ? t.title : (qsTr("轨道 ") + t.id))
                      + (t.lang ? " · " + t.lang : "");
            out.push({ tid: t.id, label: label, selected: t.selected === true });
        }
        return out;
    }

    MpvObject {
        id: mpv
        objectName: "mpvObject"
        anchors.fill: parent
        onFileLoaded: {
            var mt = mpv.getProperty("media-title");
            if (mt && String(mt).length > 0) win.mediaTitle = mt;
            var vol = mpv.getProperty("volume");
            if (vol !== undefined && vol !== null && !isNaN(vol))
                win.volumeValue = Math.round(vol);
        }
        onHostPanelRequested: (panel) => win.showHostPanel(panel)
    }

    // Single click toggles the controls (show/hide); double click toggles
    // fullscreen. The single-click action is deferred so a double-click doesn't also
    // fire the single-click toggle first (which would flash the chrome). Click no
    // longer pauses playback — pause is on Space / the bottom transport button.
    Timer {
        id: clickToggleTimer
        interval: 200
        onTriggered: win.toggleControls()
    }
    MouseArea {
        anchors.fill: parent
        acceptedButtons: Qt.LeftButton
        hoverEnabled: true
        // Hide the pointer together with the chrome during playback; any move
        // calls reveal() which restores both.
        cursorShape: win.controlsVisible ? Qt.ArrowCursor : Qt.BlankCursor
        onClicked: clickToggleTimer.restart()
        onDoubleClicked: {
            clickToggleTimer.stop();
            win.toggleFullScreen();
        }
        // Moving the mouse reveals the chrome (and re-arms auto-hide).
        onPositionChanged: win.reveal()
    }

    // ── danmaku overlay (reference parity: 播放器内原生弹幕覆层) ───────────────
    // Data comes from the host via --danmaku-file (JSON), exposed as the
    // `hillsDanmaku` context list; comments are spawned as playback advances.
    Item {
        id: danmakuLayer
        anchors.fill: parent
        visible: hillsDanmakuEnabled && danmakuOn
        property bool danmakuOn: true
        property real fontPixelSize: 24
        property real opacityValue: 0.9
        property real speedFactor: 1.0
        property int cursor: 0
        property int nextLane: 0
        property real lastPos: 0
        readonly property var comments: hillsDanmakuEnabled ? hillsDanmaku : []
        readonly property int laneHeight: Math.round(fontPixelSize * 1.5)
        readonly property int laneCount: Math.max(1, Math.floor(height * 0.55 / laneHeight))

        Component {
            id: scrollComp
            Text {
                id: d
                property int lane: 0
                color: "white"
                style: Text.Outline
                styleColor: "#000000"
                font.pixelSize: danmakuLayer.fontPixelSize
                font.bold: true
                opacity: danmakuLayer.opacityValue
                y: lane * danmakuLayer.laneHeight + 4
                x: danmakuLayer.width
                Component.onCompleted: scrollAnim.start()
                NumberAnimation {
                    id: scrollAnim
                    target: d
                    property: "x"
                    from: danmakuLayer.width
                    to: -d.implicitWidth
                    duration: Math.max(4000,
                        (danmakuLayer.width + d.implicitWidth) / 0.18 * danmakuLayer.speedFactor)
                    onFinished: d.destroy()
                }
            }
        }
        Component {
            id: staticComp
            Text {
                id: s
                property bool atTop: true
                color: "white"
                style: Text.Outline
                styleColor: "#000000"
                font.pixelSize: danmakuLayer.fontPixelSize
                font.bold: true
                opacity: danmakuLayer.opacityValue
                // Cap width + elide so an over-long comment can't run off-screen,
                // and lift the bottom row clear of the 110px control bar.
                width: Math.min(implicitWidth, danmakuLayer.width - 32)
                elide: Text.ElideRight
                horizontalAlignment: Text.AlignHCenter
                x: (danmakuLayer.width - width) / 2
                y: atTop ? 8 : danmakuLayer.height - implicitHeight - 130
                Timer { interval: 4500; running: true; onTriggered: s.destroy() }
            }
        }

        function spawn(c) {
            var mode = c.mode || "scroll";
            var col = c.color || "white";
            if (mode === "top" || mode === "bottom") {
                staticComp.createObject(danmakuLayer,
                    { text: c.text, color: col, atTop: mode === "top" });
            } else {
                var lane = nextLane % laneCount;
                nextLane = (nextLane + 1) % laneCount;
                scrollComp.createObject(danmakuLayer,
                    { text: c.text, color: col, lane: lane });
            }
        }
        function syncTo(pos) {
            while (cursor < comments.length && comments[cursor].t <= pos) {
                if (pos - comments[cursor].t <= 1.0) spawn(comments[cursor]);
                cursor++;
            }
        }
        function resetTo(pos) {
            cursor = 0;
            while (cursor < comments.length && comments[cursor].t < pos) cursor++;
        }

        Connections {
            target: mpv
            function onPositionChanged() {
                if (!danmakuLayer.visible) return;
                var pos = mpv.position;
                if (pos + 0.5 < danmakuLayer.lastPos) danmakuLayer.resetTo(pos);
                danmakuLayer.lastPos = pos;
                danmakuLayer.syncTo(pos);
            }
        }
    }

    Timer {
        id: hideTimer
        interval: 2800
        // Keep the chrome up while ANY menu (including the secondary zoom /
        // anime4k / subtitle-settings popups) is open, else it fades mid-pick.
        onTriggered: if (!mpv.paused && !settingsMenu.visible && !speedMenu.visible
                         && !audioMenu.visible && !subMenu.visible
                         && !zoomMenu.visible && !anime4kMenu.visible
                         && !subSettingsMenu.visible)
                         win.controlsVisible = false;
    }

    BusyIndicator {
        anchors.centerIn: parent
        // Spin only while actually buffering (paused-for-cache); the old
        // duration<=0 check spun forever on live streams and not at all on
        // mid-playback rebuffering.
        running: mpv.buffering
        visible: running
    }

    // ── toast ────────────────────────────────────────────────────────────────
    Rectangle {
        id: toast
        property alias text: toastText.text
        function show(t) { toastText.text = t; opacity = 1; toastTimer.restart(); }
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.bottom: parent.bottom
        anchors.bottomMargin: 150
        width: toastText.implicitWidth + 28
        height: 36
        radius: 18
        color: "#d9000000"
        opacity: 0
        visible: opacity > 0
        Behavior on opacity { NumberAnimation { duration: 200 } }
        Text { id: toastText; anchors.centerIn: parent; color: "white"; font.pixelSize: 13 }
        Timer { id: toastTimer; interval: 2200; onTriggered: toast.opacity = 0 }
    }

    // ── reusable dark popup menu ─────────────────────────────────────────────
    component PlayerMenu: Popup {
        id: pm
        property var entries: []   // [{label, checked(bool|undefined), trigger()}]
        property int entryWidth: 220
        padding: 6
        background: Rectangle { color: win.menuBg; radius: 10; border.color: "#22ffffff" }
        // Cap height to the window and scroll when the list is taller, so a long
        // audio/subtitle track list can't overflow off-screen (popupAbove only
        // clamps the origin, not the extent).
        contentItem: Flickable {
            implicitWidth: pm.entryWidth
            implicitHeight: Math.min(contentHeight, win.height - 32)
            contentHeight: menuCol.implicitHeight
            clip: true
            boundsBehavior: Flickable.StopAtBounds
            ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }
            Column {
                id: menuCol
                width: pm.entryWidth
                spacing: 2
                Repeater {
                    model: pm.entries
                    delegate: Rectangle {
                        required property var modelData
                        width: pm.entryWidth
                        height: 36
                        radius: 6
                        color: rowMa.containsMouse ? win.menuHover : "transparent"
                        Row {
                            anchors.fill: parent
                            anchors.leftMargin: 12
                            anchors.rightMargin: 12
                            spacing: 8
                            Text {
                                anchors.verticalCenter: parent.verticalCenter
                                text: modelData.checked === true ? "\u2713" : " "
                                color: win.accent
                                font.pixelSize: 13
                                width: 14
                            }
                            Text {
                                anchors.verticalCenter: parent.verticalCenter
                                text: modelData.label
                                color: "white"
                                font.pixelSize: 13
                            }
                        }
                        MouseArea {
                            id: rowMa
                            anchors.fill: parent
                            hoverEnabled: true
                            onClicked: { modelData.trigger(); pm.close(); }
                        }
                    }
                }
            }
        }
    }

    // ── bottom-bar control button (SVG icon from CH-2 set, glyph fallback) ──
    component CtrlButton: Rectangle {
        id: cb
        property string glyph: ""
        property url iconSource: ""
        property string label: ""
        property bool active: false
        property int iconSize: 20
        readonly property bool hasIcon: String(iconSource).length > 0
        signal clicked()
        width: hasIcon ? (iconSize + 18) : Math.max(40, cbText.implicitWidth + 18)
        height: 34
        radius: 6
        color: cbMa.containsMouse ? "#33ffffff" : "transparent"
        Image {
            id: cbIcon
            visible: cb.hasIcon
            anchors.centerIn: parent
            source: cb.iconSource
            sourceSize.width: cb.iconSize
            sourceSize.height: cb.iconSize
            smooth: true
            opacity: cbMa.containsMouse || cb.active ? 1.0 : 0.9
        }
        Text {
            id: cbText
            visible: !cb.hasIcon
            anchors.centerIn: parent
            text: cb.glyph
            color: cb.active ? win.accent : "white"
            font.pixelSize: 15
        }
        ToolTip.visible: cbMa.containsMouse && cb.label.length > 0
        ToolTip.delay: 600
        ToolTip.text: cb.label
        MouseArea { id: cbMa; anchors.fill: parent; hoverEnabled: true; onClicked: cb.clicked() }
    }

    // ── overlay ──────────────────────────────────────────────────────────────
    Item {
        id: controlsLayer
        objectName: "controlsLayer"
        anchors.fill: parent

        // top bar: back + title | net-speed + pin + window controls
        Rectangle {
            id: topBar
            objectName: "titleBar"
            anchors { left: parent.left; right: parent.right; top: parent.top }
            height: 56
            opacity: win.controlsVisible ? 1 : 0
            // When faded out the bar must also stop receiving input — opacity:0
            // alone keeps buttons clickable. Moving the mouse re-reveals it.
            enabled: win.controlsVisible
            Behavior on opacity { NumberAnimation { duration: 180 } }
            // Spec: drop the top shadow scrim entirely (transparent top bar).
            color: "transparent"

            Row {
                anchors { left: parent.left; leftMargin: 10; verticalCenter: parent.verticalCenter }
                spacing: 8
                CtrlButton {
                    objectName: "btnBack"
                    iconSource: "icons/back.svg"   // back → host shows detail page; window closes
                    iconSize: 22
                    label: qsTr("返回")
                    onClicked: { mpv.uiAction("back"); win.close(); }
                }
                Column {
                    anchors.verticalCenter: parent.verticalCenter
                    spacing: 2
                    Text {
                        text: win.displayTitle()
                        visible: text.length > 0
                        color: "white"
                        font.pixelSize: 16
                        font.bold: true
                        elide: Text.ElideRight
                        width: Math.min(implicitWidth, win.width * 0.5)
                    }
                }
            }

            Row {
                anchors { right: parent.right; top: parent.top; bottom: parent.bottom }
                spacing: 0

                // net speed (toggle in settings; spec: off by default).
                // Spec: show ONLY the speed number — no sparkline/underline.
                Item {
                    visible: win.netSpeedVisible
                    width: 96
                    height: topBar.height
                    Text {
                        id: netSpeedText
                        anchors.centerIn: parent
                        color: "white"
                        font.pixelSize: 12
                        text: "0.0 MB/s"
                    }
                }

                CtrlButton {
                    objectName: "btnPin"
                    iconSource: win.pinned ? "icons/pin-active.svg" : "icons/pin.svg"
                    label: qsTr("置顶")
                    active: win.pinned
                    height: topBar.height
                    onClicked: win.togglePinned()
                }

                // Explicit instances (NOT a Repeater): Repeater delegates are
                // invisible to QQuickWindow::findChild on the C++ side, so they were
                // never registered as QWK system buttons → unclickable. Direct
                // children (like btnBack) are found and register correctly.
                Rectangle {
                    objectName: "btnMin"
                    width: 46
                    height: topBar.height
                    color: minMa.containsMouse ? "#33ffffff" : "transparent"
                    Image {
                        anchors.centerIn: parent
                        opacity: minMa.containsMouse ? 1.0 : 0.75
                        source: "icons/minimize.svg"
                        sourceSize.width: 18
                        sourceSize.height: 18
                        smooth: true
                    }
                    MouseArea {
                        id: minMa
                        anchors.fill: parent
                        hoverEnabled: true
                        onClicked: win.showMinimized()
                    }
                }
                Rectangle {
                    objectName: "btnMax"
                    width: 46
                    height: topBar.height
                    color: maxMa.containsMouse ? "#33ffffff" : "transparent"
                    Image {
                        anchors.centerIn: parent
                        opacity: maxMa.containsMouse ? 1.0 : 0.75
                        // Track the real window state (maximize ↔ restore glyph).
                        source: win.visibility === Window.Maximized
                                ? "icons/restore.svg" : "icons/maximize.svg"
                        sourceSize.width: 18
                        sourceSize.height: 18
                        smooth: true
                    }
                    MouseArea {
                        id: maxMa
                        anchors.fill: parent
                        hoverEnabled: true
                        onClicked: win.toggleMaximize()
                    }
                }
                Rectangle {
                    objectName: "btnClose"
                    width: 46
                    height: topBar.height
                    color: closeMa.containsMouse ? "#e81123" : "transparent"
                    Image {
                        anchors.centerIn: parent
                        opacity: closeMa.containsMouse ? 1.0 : 0.75
                        source: "icons/close.svg"
                        sourceSize.width: 18
                        sourceSize.height: 18
                        smooth: true
                    }
                    MouseArea {
                        id: closeMa
                        anchors.fill: parent
                        hoverEnabled: true
                        onClicked: win.close()
                    }
                }
            }
        }

        // bottom bar: purple seekbar + transport | right control cluster
        Rectangle {
            id: bottomBar
            anchors { left: parent.left; right: parent.right; bottom: parent.bottom }
            height: 124
            opacity: win.controlsVisible ? 1 : 0
            enabled: win.controlsVisible
            Behavior on opacity { NumberAnimation { duration: 180 } }
            // Spec: lighten the bottom scrim (was #e6 ≈ 90% black).
            gradient: Gradient {
                GradientStop { position: 0.0; color: "#00000000" }
                GradientStop { position: 1.0; color: "#99000000" }
            }

            ColumnLayout {
                anchors { left: parent.left; right: parent.right; bottom: parent.bottom; margins: 14 }
                spacing: 6

                // progress: left time · purple bar w/ round thumb · total
                RowLayout {
                    Layout.fillWidth: true
                    spacing: 10
                    // While scrubbing show the drag target, not the live position,
                    // so the readout matches where the thumb will seek to on release.
                    Label {
                        text: win.fmt(seekbar.pressed ? seekbar.value : mpv.position)
                        color: "white"
                        font.pixelSize: 12
                    }
                    Slider {
                        id: seekbar
                        Layout.fillWidth: true
                        // Taller interactive area so grabbing/dragging the bar is
                        // forgiving and never falls through to the video tap (which
                        // would pause). The visual bar stays thin & centered.
                        implicitHeight: 30
                        padding: 0
                        // Don't take key focus, else its built-in arrow handling
                        // fires alongside the global Left/Right seek shortcuts.
                        focusPolicy: Qt.NoFocus
                        from: 0
                        to: Math.max(1, mpv.duration)
                        Connections {
                            target: mpv
                            function onPositionChanged() {
                                if (!seekbar.pressed) seekbar.value = mpv.position;
                            }
                        }
                        onPressedChanged: if (!pressed) mpv.seekAbsolute(value)
                        background: Rectangle {
                            x: seekbar.leftPadding
                            y: seekbar.topPadding + seekbar.availableHeight / 2 - height / 2
                            width: seekbar.availableWidth
                            height: 6
                            radius: 3
                            color: "#59ffffff"
                            Rectangle {
                                width: seekbar.visualPosition * parent.width
                                height: parent.height
                                radius: 3
                                color: win.accent
                            }
                        }
                        handle: Rectangle {
                            x: seekbar.leftPadding + seekbar.visualPosition
                               * (seekbar.availableWidth - width)
                            y: seekbar.topPadding + seekbar.availableHeight / 2 - height / 2
                            width: 20; height: 20; radius: 10
                            color: seekbar.pressed ? win.accentHover : "white"
                            border.color: win.accent
                            border.width: 2
                        }
                    }
                    Label { text: win.fmt(mpv.duration); color: "white"; font.pixelSize: 12 }
                }

                // transport (left) | spacer | right cluster (spec order)
                RowLayout {
                    Layout.fillWidth: true
                    spacing: 4

                    CtrlButton {
                        iconSource: "icons/prev.svg"; label: qsTr("上一集")
                        onClicked: { mpv.command(["playlist-prev"]); mpv.uiAction("prev-episode"); }
                    }
                    CtrlButton {
                        iconSource: mpv.paused ? "icons/play.svg" : "icons/pause.svg"
                        label: mpv.paused ? qsTr("播放") : qsTr("暂停")
                        iconSize: 26
                        onClicked: mpv.togglePause()
                    }
                    CtrlButton {
                        iconSource: "icons/next.svg"; label: qsTr("下一集")
                        onClicked: { mpv.command(["playlist-next"]); mpv.uiAction("next-episode"); }
                    }
                    CtrlButton {
                        id: volBtn
                        // Bind to the observed mpv mute state so the glyph stays
                        // correct no matter who toggles it (UI, key, host IPC).
                        iconSource: mpv.muted ? "icons/volume-muted.svg" : "icons/volume.svg"
                        label: qsTr("音量/静音")
                        onClicked: mpv.setProperty("mute", mpv.muted ? "no" : "yes")
                    }
                    Slider {
                        id: volSlider
                        from: 0; to: 100
                        value: win.volumeValue
                        implicitWidth: 110
                        onMoved: { win.volumeValue = Math.round(value); mpv.setVolume(win.volumeValue); }
                        background: Rectangle {
                            x: volSlider.leftPadding
                            y: volSlider.topPadding + volSlider.availableHeight / 2 - height / 2
                            width: volSlider.availableWidth
                            height: 3
                            radius: 1.5
                            color: "#59ffffff"
                            Rectangle {
                                width: volSlider.visualPosition * parent.width
                                height: parent.height
                                radius: 1.5
                                color: "white"
                            }
                        }
                        handle: Rectangle {
                            x: volSlider.leftPadding + volSlider.visualPosition
                               * (volSlider.availableWidth - width)
                            y: volSlider.topPadding + volSlider.availableHeight / 2 - height / 2
                            width: 10; height: 10; radius: 5
                            color: "white"
                        }
                    }

                    Item { Layout.fillWidth: true }

                    // right cluster, spec order:
                    // 倍速 · 版本 · 音轨 · 字幕 · 弹幕 · 设置 · 选集 · 全屏
                    CtrlButton {
                        id: speedBtn
                        glyph: mpv.speed.toFixed(mpv.speed === Math.floor(mpv.speed) ? 1 : 2) + "x"
                        label: qsTr("倍速")
                        onClicked: speedMenu.popup(speedBtn)
                    }
                    CtrlButton {
                        id: versionBtn
                        iconSource: "icons/version.svg"; label: qsTr("版本")
                        // Ask the host (it owns the Emby session) to push the
                        // version list; QML renders it in hostMenu on arrival.
                        onClicked: mpv.uiAction("versions")
                    }
                    CtrlButton {
                        id: qualityBtn
                        iconSource: "icons/quality.svg"; label: qsTr("清晰度")
                        onClicked: mpv.uiAction("quality")
                    }
                    CtrlButton {
                        id: audioBtn
                        iconSource: "icons/audio-track.svg"; label: qsTr("音轨")
                        onClicked: { audioMenu.reload(); audioMenu.popup(audioBtn); }
                    }
                    CtrlButton {
                        id: subBtn
                        iconSource: "icons/subtitle.svg"; label: qsTr("字幕")
                        onClicked: { subMenu.reload(); subMenu.popup(subBtn); }
                    }
                    CtrlButton {
                        iconSource: "icons/danmaku.svg"; label: qsTr("弹幕")
                        active: hillsDanmakuEnabled && danmakuLayer.danmakuOn
                        onClicked: {
                            if (hillsDanmakuEnabled)
                                danmakuLayer.danmakuOn = !danmakuLayer.danmakuOn;
                            mpv.uiAction("danmaku");
                        }
                    }
                    CtrlButton {
                        id: gearBtn
                        iconSource: "icons/settings.svg"; label: qsTr("设置")
                        onClicked: settingsMenu.popup(gearBtn)
                    }
                    CtrlButton {
                        id: episodesBtn
                        iconSource: "icons/playlist.svg"; label: qsTr("选集")
                        onClicked: mpv.uiAction("episodes")
                    }
                    CtrlButton {
                        iconSource: "icons/fullscreen.svg"; label: qsTr("全屏")
                        onClicked: win.toggleFullScreen()
                    }
                }
            }
        }
    }

    // ── popup menus ──────────────────────────────────────────────────────────
    function popupAbove(menu, anchorItem) {
        var p = anchorItem.mapToItem(controlsLayer, 0, 0);
        // Compute the menu size deterministically from the entry count (each row is
        // 36px tall + 2px spacing, plus 6px padding top & bottom). Measuring
        // menu.height after open() was unreliable — the Popup content lays out over
        // several frames, so a tall menu often opened at the bottom and got cut off
        // (问题3). entryWidth is the known content width.
        var n = (menu.entries && menu.entries.length) ? menu.entries.length : 1;
        var w = (menu.entryWidth > 0 ? menu.entryWidth : 220) + 12;
        var h = Math.min(n * 38 + 12, win.height - 32);
        menu.x = Math.max(8, Math.min(p.x, win.width - w - 8));
        menu.y = Math.max(8, Math.min(p.y - h - 8, win.height - h - 8));
        menu.open();
    }

    PlayerMenu {
        id: speedMenu
        parent: controlsLayer
        function popup(item) {
            entries = ["0.5", "0.75", "1.0", "1.25", "1.5", "2.0"].map(function (s) {
                return {
                    label: s + "x",
                    checked: Math.abs(mpv.speed - parseFloat(s)) < 0.001,
                    trigger: function () { mpv.setSpeed(parseFloat(s)); }
                };
            });
            win.popupAbove(speedMenu, item);
        }
        entryWidth: 120
    }

    PlayerMenu {
        id: audioMenu
        parent: controlsLayer
        function reload() {
            entries = win.tracksOf("audio").map(function (t) {
                return {
                    label: t.label,
                    checked: t.selected,
                    trigger: function () { mpv.setAudioId(t.tid); }
                };
            });
            if (entries.length === 0)
                entries = [{ label: qsTr("无音轨"), checked: false, trigger: function () {} }];
        }
        function popup(item) { win.popupAbove(audioMenu, item); }
        entryWidth: 260
    }

    PlayerMenu {
        id: subMenu
        parent: controlsLayer
        function reload() {
            var list = win.tracksOf("sub").map(function (t) {
                return {
                    label: t.label,
                    checked: t.selected,
                    trigger: function () { mpv.setSubId(t.tid); }
                };
            });
            list.push({
                label: qsTr("关闭字幕"),
                checked: false,
                trigger: function () { mpv.setProperty("sid", "no"); }
            });
            entries = list;
        }
        function popup(item) { win.popupAbove(subMenu, item); }
        entryWidth: 260
    }

    // Host-driven selection panel (episodes / versions / quality). Its entries are
    // filled by win.showHostPanel() when the host pushes a list; wider than the
    // track menus so episode titles fit.
    PlayerMenu {
        id: hostMenu
        parent: controlsLayer
        entryWidth: 320
    }

    PlayerMenu {
        id: settingsMenu
        parent: controlsLayer
        property string zoomMode: "fit"
        function popup(item) {
            entries = [
                { label: qsTr("缩放模式  ▸"), checked: false,
                  trigger: function () { zoomMenu.popup(gearBtn); } },
                { label: qsTr("Anime4K  ▸"), checked: mpv.anime4k.preset !== "Off"
                                                       && mpv.anime4k.preset !== "",
                  trigger: function () { anime4kMenu.popup(gearBtn); } },
                { label: qsTr("跳过片头/片尾"), checked: false,
                  trigger: function () { win.hostAction("skip-intro-settings", qsTr("跳过片头/片尾")); } },
                { label: qsTr("字幕设置  ▸"), checked: false,
                  trigger: function () { subSettingsMenu.popup(gearBtn); } },
                { label: qsTr("弹幕设置"), checked: false,
                  trigger: function () { win.hostAction("danmaku-settings", qsTr("弹幕设置")); } },
                { label: qsTr("统计信息"), checked: false,
                  trigger: function () { mpv.command(["script-binding", "stats/display-stats-toggle"]); } },
                { label: qsTr("显示网速"), checked: win.netSpeedVisible,
                  trigger: function () { win.netSpeedVisible = !win.netSpeedVisible; } }
            ];
            win.popupAbove(settingsMenu, item);
        }
        entryWidth: 220
    }

    PlayerMenu {
        id: zoomMenu
        parent: controlsLayer
        function popup(item) {
            var modes = [
                { key: "fit", label: qsTr("适应") },
                { key: "fill", label: qsTr("填充") },
                { key: "stretch", label: qsTr("拉伸") },
                { key: "original", label: qsTr("原始") }
            ];
            entries = modes.map(function (m) {
                return {
                    label: m.label,
                    checked: settingsMenu.zoomMode === m.key,
                    trigger: function () { win.applyZoomMode(m.key); }
                };
            });
            win.popupAbove(zoomMenu, item);
        }
        entryWidth: 140
    }

    PlayerMenu {
        id: anime4kMenu
        parent: controlsLayer
        function popup(item) {
            entries = mpv.anime4k.presets.map(function (p) {
                return {
                    label: p,
                    checked: mpv.anime4k.preset === p,
                    trigger: function () { mpv.setAnime4kPreset(p); }
                };
            });
            win.popupAbove(anime4kMenu, item);
        }
        entryWidth: 140
    }

    PlayerMenu {
        id: subSettingsMenu
        parent: controlsLayer
        function popup(item) {
            function subDelay() {
                var d = mpv.getProperty("sub-delay");
                return (d === undefined || d === null) ? 0 : Number(d);
            }
            function subScale() {
                var s = mpv.getProperty("sub-scale");
                return (s === undefined || s === null) ? 1 : Number(s);
            }
            entries = [
                { label: qsTr("字幕延迟 -0.5s（当前 ") + subDelay().toFixed(1) + "s）",
                  checked: false,
                  trigger: function () { mpv.setProperty("sub-delay", String(subDelay() - 0.5)); } },
                { label: qsTr("字幕延迟 +0.5s"), checked: false,
                  trigger: function () { mpv.setProperty("sub-delay", String(subDelay() + 0.5)); } },
                { label: qsTr("字号变小"), checked: false,
                  trigger: function () { mpv.setProperty("sub-scale", String(Math.max(0.4, subScale() - 0.1))); } },
                { label: qsTr("字号变大"), checked: false,
                  trigger: function () { mpv.setProperty("sub-scale", String(Math.min(3.0, subScale() + 0.1))); } },
                { label: qsTr("重置字幕样式"), checked: false,
                  trigger: function () {
                      mpv.setProperty("sub-delay", "0");
                      mpv.setProperty("sub-scale", "1.0");
                  } }
            ];
            win.popupAbove(subSettingsMenu, item);
        }
        entryWidth: 230
    }

    // ── net-speed poller (mpv cache-speed, bytes/s) ──────────────────────────
    Timer {
        interval: 1000
        repeat: true
        running: win.netSpeedVisible
        onTriggered: {
            var bps = mpv.getProperty("cache-speed");
            var mbs = (bps && !isNaN(bps)) ? bps / (1024 * 1024) : 0;
            netSpeedText.text = mbs.toFixed(mbs >= 10 ? 0 : 1) + " MB/s";
        }
    }

    // ── shortcuts ────────────────────────────────────────────────────────────
    Shortcut { sequences: ["Space"]; onActivated: mpv.togglePause() }
    Shortcut { sequences: ["F"]; onActivated: win.toggleFullScreen() }
    Shortcut {
        sequences: ["Escape"]
        onActivated: if (win.visibility === Window.FullScreen) win.visibility = Window.Windowed
    }
    Shortcut { sequences: ["Right"]; onActivated: mpv.seekRelative(5) }
    Shortcut { sequences: ["Left"]; onActivated: mpv.seekRelative(-5) }
    Shortcut {
        sequences: ["Up"]
        onActivated: {
            win.volumeValue = Math.min(100, win.volumeValue + 5);
            mpv.setVolume(win.volumeValue);
        }
    }
    Shortcut {
        sequences: ["Down"]
        onActivated: {
            win.volumeValue = Math.max(0, win.volumeValue - 5);
            mpv.setVolume(win.volumeValue);
        }
    }
    Shortcut {
        sequences: ["m", "M"]
        onActivated: mpv.setProperty("mute", mpv.muted ? "no" : "yes")
    }
    Shortcut {
        sequences: [">"]
        onActivated: { mpv.command(["playlist-next"]); mpv.uiAction("next-episode"); }
    }
    Shortcut {
        sequences: ["<"]
        onActivated: { mpv.command(["playlist-prev"]); mpv.uiAction("prev-episode"); }
    }
}
