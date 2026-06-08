#include "control_channel.h"

#include <iostream>
#include <string>

ControlChannel::ControlChannel(QObject *parent) : QObject(parent) {}

ControlChannel::~ControlChannel() { stop(); }

void ControlChannel::start() {
    if (m_running.exchange(true)) {
        return;
    }
    m_thread = std::thread([this]() {
        std::string line;
        while (m_running.load() && std::getline(std::cin, line)) {
            const QString qline = QString::fromUtf8(line.c_str());
            if (qline.trimmed().isEmpty()) {
                continue;
            }
            // Deliver to the GUI thread; the connection is queued.
            emit lineReceived(qline);
        }
        emit eof();
    });
}

void ControlChannel::stop() {
    m_running.store(false);
    if (m_thread.joinable()) {
        // stdin getline may still be blocking; detach so shutdown never hangs.
        m_thread.detach();
    }
}
