use std::thread;
use std::time::Duration;
use sysinfo::Networks;

fn dump(label: &str, networks: &Networks) {
    println!("{label}: {} interfaces", networks.iter().count());
    for (name, data) in networks.iter() {
        println!("  {name}: rx={} tx={}", data.received(), data.transmitted());
    }
}

fn main() {
    let mut networks = Networks::new_with_refreshed_list();
    dump("initial", &networks);
    thread::sleep(Duration::from_millis(700));
    networks.refresh(true);
    dump("after refresh", &networks);
}
