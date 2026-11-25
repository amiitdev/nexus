fn main() {
    let first = nexus::monitor::network::collect();
    println!("first: iface={} rx={} tx={} down={} up={} wifi={} ssid={:?} dbm={:?}",
        first.interface, first.total_received_bytes, first.total_transmitted_bytes,
        first.download_bytes_per_sec, first.upload_bytes_per_sec,
        first.is_wireless, first.ssid, first.signal_dbm);
    std::thread::sleep(std::time::Duration::from_secs(2));
    let second = nexus::monitor::network::collect();
    println!("second: iface={} rx={} tx={} down={:.0} B/s up={:.0} B/s ssid={:?}",
        second.interface, second.total_received_bytes, second.total_transmitted_bytes,
        second.download_bytes_per_sec, second.upload_bytes_per_sec, second.ssid);
}
