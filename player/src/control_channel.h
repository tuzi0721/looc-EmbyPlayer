#pragma once

#include <QObject>
#include <QString>
#include <thread>
#include <atomic>

// Reads newline-delimited JSON control commands from stdin on a worker thread
// and forwards each raw line to the GUI thread (queued) for dispatch.
//
// This is the inbound half of the host↔player channel that HillsPlayer has but
// emby-player's first standalone.rs lacked (CH-5 flagged it as the decisive
// gap). The host (T9c/CH-4) writes commands like:
//   {"action":"loadfile","url":"..."}
//   {"action":"pause"} / {"action":"play"} / {"action":"toggle-pause"}
//   {"action":"seek","value":12.3,"mode":"absolute"|"relative"}
//   {"action":"set-audio","id":2} / {"action":"set-sub","id":1}
//   {"action":"set-property","name":"volume","value":"80"}
//   {"action":"command","args":["..."]}
//   {"action":"anime4k","preset":"A"}
//   {"action":"quit"}
// Exact field names should be confirmed with CH-4 (T9c) before wiring the host.
class ControlChannel : public QObject {
    Q_OBJECT
public:
    explicit ControlChannel(QObject *parent = nullptr);
    ~ControlChannel() override;

    void start();
    void stop();

signals:
    void lineReceived(const QString &line);
    void eof();

private:
    std::thread m_thread;
    std::atomic_bool m_running{false};
};
