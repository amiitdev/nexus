fn main() {
    for round in 1..=2 {
        let list = nexus::processes::list();
        let mut rows = list.processes.clone();
        rows.sort_by(|a, b| b.cpu_usage.partial_cmp(&a.cpu_usage).unwrap());
        println!("round {round}: {} processes", list.total);
        for p in rows.iter().take(5) {
            println!("  {:<24} pid={:<7} cpu={:>6.2}%  mem={}", p.name, p.pid, p.cpu_usage, p.memory_bytes);
        }
        std::thread::sleep(std::time::Duration::from_secs(2));
    }
}
