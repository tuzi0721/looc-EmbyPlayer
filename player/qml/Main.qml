import QtQuick
import QtQuick.Window
import QtQuick.Controls.Basic
import QtQuick.Layouts
import HillsPlayer

// Root player window. The video is a normal Qt Quick item (MpvObject, a
// QQuickFramebufferObject driven by the libmpv render API), so these QML
// controls overlay it directly with no native child window, no reserved dead
// zone, and no pointer swallowing.
//
// T9b first cut authored by CH-1 (build hub) to keep momentum; CH-6 to refine
// into FluentUI (zhuzichu520) look + audio/subtitle/picture-mode/danmaku panels.
Window {
    id: win
    width: 1280
    height: 720
    visible: true
    color: "black"
    title: qsTr("Hills Player")

    property bool controlsVisible: true

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
    function toggleFullScreen() {
        win.visibility = (win.visibility === Window.FullScreen)
            ? Window.Windowed : Window.FullScreen;
    }
    function toggleMaximize() {
        win.visibility = (win.visibility === Window.Maximized)
            ? Window.Windowed : Window.Maximized;
    }

    MpvObject {
        id: mpv
        objectName: "mpvObject"
        anchors.fill: parent
    }

    // Click toggles play/pause; double-click toggles fullscreen; movement reveals
    // the controls. Buttons declared later sit above this and consume their own
    // clicks, so only clicks on the bare video reach here.
    MouseArea {
        anchors.fill: parent
        acceptedButtons: Qt.LeftButton
        hoverEnabled: true
        onClicked: mpv.togglePause()
        onDoubleClicked: win.toggleFullScreen()
        onPositionChanged: win.reveal()
    }

    Timer {
        id: hideTimer
        interval: 2800
        onTriggered: if (!mpv.paused) win.controlsVisible = false
    }

    // Buffering / loading spinner (visible until first frame timing is known).
    BusyIndicator {
        anchors.centerIn: parent
        running: mpv.duration <= 0
        visible: running
    }

    // ── Control overlay (T9b first cut) ─────────────────────────────────────
    Item {
        id: controlsLayer
        objectName: "controlsLayer"
        anchors.fill: parent

        Rectangle {
            id: topBar
            objectName: "titleBar"
            anchors { left: parent.left; right: parent.right; top: parent.top }
            height: 52
            opacity: win.controlsVisible ? 1 : 0
            Behavior on opacity { NumberAnimation { duration: 180 } }
            gradient: Gradient {
                GradientStop { position: 0.0; color: "#cc000000" }
                GradientStop { position: 1.0; color: "#00000000" }
            }
            Text {
                anchors { left: parent.left; leftMargin: 18; verticalCenter: parent.verticalCenter }
                text: win.title
                color: "white"
                font.pixelSize: 16
                font.bold: true
            }

            // Frameless window controls (QWindowKit). objectNames are registered
            // hit-test-visible in main.cpp so clicks hit the buttons, not drag.
            Row {
                anchors { right: parent.right; top: parent.top; bottom: parent.bottom }
                Repeater {
                    model: [
                        { name: "btnMin", glyph: "\u2014", hover: "#33ffffff" },
                        { name: "btnMax", glyph: "\u25A1", hover: "#33ffffff" },
                        { name: "btnClose", glyph: "\u2715", hover: "#e81123" }
                    ]
                    delegate: Rectangle {
                        required property var modelData
                        objectName: modelData.name
                        width: 46
                        height: topBar.height
                        color: btnHover.containsMouse ? modelData.hover : "transparent"
                        Text {
                            anchors.centerIn: parent
                            text: modelData.glyph
                            color: "white"
                            font.pixelSize: 14
                        }
                        MouseArea {
                            id: btnHover
                            anchors.fill: parent
                            hoverEnabled: true
                            onClicked: {
                                if (modelData.name === "btnMin") win.showMinimized();
                                else if (modelData.name === "btnMax") win.toggleMaximize();
                                else win.close();
                            }
                        }
                    }
                }
            }
        }

        Rectangle {
            id: bottomBar
            anchors { left: parent.left; right: parent.right; bottom: parent.bottom }
            height: 104
            opacity: win.controlsVisible ? 1 : 0
            Behavior on opacity { NumberAnimation { duration: 180 } }
            gradient: Gradient {
                GradientStop { position: 0.0; color: "#00000000" }
                GradientStop { position: 1.0; color: "#e6000000" }
            }

            ColumnLayout {
                anchors { left: parent.left; right: parent.right; bottom: parent.bottom; margins: 14 }
                spacing: 8

                RowLayout {
                    Layout.fillWidth: true
                    spacing: 10
                    Label { text: win.fmt(mpv.position); color: "white"; font.pixelSize: 12 }
                    Slider {
                        id: seekbar
                        Layout.fillWidth: true
                        from: 0
                        to: Math.max(1, mpv.duration)
                        Connections {
                            target: mpv
                            function onPositionChanged() {
                                if (!seekbar.pressed) seekbar.value = mpv.position;
                            }
                        }
                        onPressedChanged: if (!pressed) mpv.seekAbsolute(value)
                    }
                    Label { text: win.fmt(mpv.duration); color: "white"; font.pixelSize: 12 }
                }

                RowLayout {
                    Layout.fillWidth: true
                    spacing: 8
                    Button {
                        implicitWidth: 64
                        text: mpv.paused ? qsTr("播放") : qsTr("暂停")
                        onClicked: mpv.togglePause()
                    }
                    Button { text: qsTr("-10s"); onClicked: mpv.seekRelative(-10) }
                    Button { text: qsTr("+10s"); onClicked: mpv.seekRelative(10) }

                    Label { text: qsTr("音量"); color: "white"; font.pixelSize: 12 }
                    Slider {
                        from: 0; to: 100; value: 100
                        implicitWidth: 120
                        onMoved: mpv.setVolume(value)
                    }

                    Item { Layout.fillWidth: true }

                    Label { text: qsTr("倍速"); color: "white"; font.pixelSize: 12 }
                    ComboBox {
                        implicitWidth: 92
                        model: ["0.5", "0.75", "1.0", "1.25", "1.5", "2.0"]
                        currentIndex: 2
                        onActivated: mpv.setSpeed(parseFloat(currentText))
                    }

                    Label { text: "Anime4K"; color: "white"; font.pixelSize: 12 }
                    ComboBox {
                        implicitWidth: 104
                        model: ["Off", "Fast", "A", "B", "C", "A+A", "B+B", "C+A"]
                        currentIndex: 0
                        onActivated: mpv.setAnime4kPreset(currentText)
                    }

                    Button {
                        implicitWidth: 64
                        text: qsTr("全屏")
                        onClicked: win.toggleFullScreen()
                    }
                }
            }
        }
    }

    Shortcut { sequences: ["Space"]; onActivated: mpv.togglePause() }
    Shortcut { sequences: ["F"]; onActivated: win.toggleFullScreen() }
    Shortcut {
        sequences: ["Escape"]
        onActivated: if (win.visibility === Window.FullScreen) win.visibility = Window.Windowed
    }
    Shortcut { sequences: ["Right"]; onActivated: mpv.seekRelative(5) }
    Shortcut { sequences: ["Left"]; onActivated: mpv.seekRelative(-5) }
}
