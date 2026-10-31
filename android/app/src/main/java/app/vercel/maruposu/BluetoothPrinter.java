package app.vercel.maruposu;

import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothSocket;
import android.content.Context;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.io.OutputStream;
import java.lang.reflect.Method;
import java.util.UUID;

/**
 * Sends ESC/POS bytes to a paired Bluetooth thermal printer over the classic
 * Serial Port Profile (MPT-II and most 58/80 mm printers). Callers must hold
 * the Bluetooth permission (BLUETOOTH_CONNECT on Android 12+).
 */
@SuppressLint("MissingPermission")
final class BluetoothPrinter {
    private static final UUID SPP = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    /** Small writes with short pauses: cheap printers have tiny input buffers. */
    private static final int CHUNK = 256;
    private static final int CHUNK_PAUSE_MS = 20;
    /** Per connection attempt; a printer that is off would otherwise block for long. */
    private static final int CONNECT_TIMEOUT_MS = 8000;

    private final Context context;

    BluetoothPrinter(Context context) {
        this.context = context.getApplicationContext();
    }

    private BluetoothAdapter adapter() throws IOException {
        BluetoothManager manager = (BluetoothManager) context.getSystemService(Context.BLUETOOTH_SERVICE);
        BluetoothAdapter adapter = manager == null ? null : manager.getAdapter();
        if (adapter == null) throw new IOException("Tablet ini tidak punya Bluetooth");
        if (!adapter.isEnabled()) throw new IOException("Bluetooth tablet mati");
        return adapter;
    }

    /** Paired devices as [{name, address}]. */
    JSONArray paired() throws IOException, JSONException {
        JSONArray list = new JSONArray();
        for (BluetoothDevice d : adapter().getBondedDevices()) {
            String name = d.getName();
            list.put(new JSONObject().put("name", name == null || name.isEmpty() ? d.getAddress() : name).put("address", d.getAddress()));
        }
        return list;
    }

    /** One job at a time; connects, writes, waits for the printer to take it, closes. */
    synchronized void print(String address, byte[] data) throws IOException {
        BluetoothAdapter adapter = adapter();
        if (!BluetoothAdapter.checkBluetoothAddress(address)) throw new IOException("Alamat printer tidak valid");
        BluetoothDevice device = null;
        for (BluetoothDevice d : adapter.getBondedDevices()) if (d.getAddress().equalsIgnoreCase(address)) device = d;
        if (device == null) throw new IOException("Printer belum di-pair di Bluetooth tablet");
        adapter.cancelDiscovery();
        BluetoothSocket socket = connect(device);
        try {
            OutputStream out = socket.getOutputStream();
            for (int i = 0; i < data.length; i += CHUNK) {
                out.write(data, i, Math.min(CHUNK, data.length - i));
                out.flush();
                pause(CHUNK_PAUSE_MS);
            }
            // Closing right away can cut off the tail of the receipt
            pause(300 + data.length / 8);
        } finally {
            try {
                socket.close();
            } catch (IOException ignored) {
                // already closed
            }
        }
    }

    /** Standard SPP socket, then the insecure and channel-1 fallbacks many cheap printers need. */
    private BluetoothSocket connect(BluetoothDevice device) throws IOException {
        IOException last = null;
        for (int attempt = 0; attempt < 3; attempt++) {
            BluetoothSocket socket = null;
            try {
                if (attempt == 0) socket = device.createRfcommSocketToServiceRecord(SPP);
                else if (attempt == 1) socket = device.createInsecureRfcommSocketToServiceRecord(SPP);
                else {
                    Method m = device.getClass().getMethod("createRfcommSocket", int.class);
                    socket = (BluetoothSocket) m.invoke(device, 1);
                }
                connectWithin(socket, CONNECT_TIMEOUT_MS);
                return socket;
            } catch (Exception e) {
                last = e instanceof IOException ? (IOException) e : new IOException(e.getMessage(), e);
                if (socket != null) {
                    try {
                        socket.close();
                    } catch (IOException ignored) {
                        // nothing to close
                    }
                }
            }
        }
        throw new IOException("Tidak bisa tersambung ke printer", last);
    }

    /** BluetoothSocket.connect() has no timeout: close it from a watchdog to give up. */
    private static void connectWithin(BluetoothSocket socket, int ms) throws IOException {
        Thread watchdog = new Thread(() -> {
            try {
                Thread.sleep(ms);
                socket.close();
            } catch (InterruptedException | IOException ignored) {
                // connected in time, or already closed
            }
        });
        watchdog.start();
        try {
            socket.connect();
        } finally {
            watchdog.interrupt();
        }
    }

    private static void pause(int ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
