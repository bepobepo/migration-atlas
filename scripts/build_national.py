"""Build a country-at-a-time national series from pinned publications, independent of routes."""
import argparse
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "dist/data"
NATIONAL = DATA / "national"
START, END = 1950, 2024
GROSS = ("immigration", "emigration")
FLAG_NAMES = {
    "b": "break in series", "d": "definition differs", "e": "estimated",
    "f": "forecast", "i": "imputed", "p": "provisional", "r": "revised",
    "u": "low reliability", "s": "Eurostat estimate", "z": "not applicable",
}


def read(path):
    return json.loads(path.read_text())


def measurement(value, sources, kind, flags=()):
    if type(value) is not int:
        raise ValueError(f"Non-integer migration value {value!r}")
    return dict(value=value, sourceIds=list(dict.fromkeys(sources)), kind=kind, flags=list(dict.fromkeys(flags)))


def observation(row, *, gross=False):
    flags = row.get("flags", [])
    if isinstance(flags, str):
        flags = [FLAG_NAMES[f] for f in flags if not f.isspace()] if flags else []
    if gross and row["value"] < 0:
        raise ValueError("Negative gross migration count")
    return measurement(row["value"], [row["source"]], row.get("kind", "published"), flags)


def select_year(code, year, collections, ons, net, sources):
    period = str(year)
    if code == "GBR" and year in ons:
        row = ons[year]
        return {field: measurement(row[field], ["ons"], "published", ["revised"] if row["revised"] else [])
                for field in (*GROSS, "net")}

    result = dict.fromkeys((*GROSS, "net"))
    # Keep component-specific gaps. Never use a sum of bilateral routes as a national total.
    for collection in collections:
        row = collection["countries"].get(code, {}).get(period, {})
        for field in GROSS:
            if result[field] is None and row.get(field) is not None:
                result[field] = observation(row[field], gross=True)
        if result["net"] is None and row.get("net") is not None:
            # Some publishers revise or round their balance separately from the two gross flows.
            result["net"] = observation(row["net"])
        incoming, outgoing = (row.get(field) for field in GROSS)
        if (incoming and outgoing and result["net"] is None and
                result["immigration"]["sourceIds"] == [incoming["source"]] and
                result["emigration"]["sourceIds"] == [outgoing["source"]] and
                row.get("netComparable", True)):
            a = sources[incoming["source"]].get("pairGroup")
            b = sources[outgoing["source"]].get("pairGroup")
            if a and a == b:
                result["net"] = measurement(incoming["value"] - outgoing["value"],
                    [incoming["source"], outgoing["source"]], "derived",
                    result["immigration"]["flags"] + result["emigration"]["flags"])
    if result["net"] is None:
        value = net["countries"].get(code, {}).get(period)
        if value is not None:
            kind = "projection" if year in net["projectionYears"] else "estimate"
            result["net"] = measurement(value, ["wpp"], kind)
    return result


def main(check):
    collections = []
    for filename in ("uk-history", "nz", "canada", "eurostat", "historical"):
        data = read(NATIONAL / (filename + ".json"))
        if filename == "eurostat":
            for source in data["sources"].values():
                source["pairGroup"] = "eurostat_all_residents"
        collections.append(data)
    net = read(NATIONAL / "net.json")
    uk = read(DATA / "official/uk-national.json")
    ons = {row["year"]: row for row in uk["years"]}
    sources = {
        "ons": {**uk["source"], "definition": "UK long-term moves of at least 12 months, all nationalities. ONS publishes separately rounded immigration, emigration and net migration. Its methods changed in June 2021."},
        "wpp": net["source"],
    }
    for collection in collections:
        if sources.keys() & collection["sources"].keys():
            raise ValueError("Duplicate national source ID")
        sources.update(collection["sources"])
    dest = NATIONAL / "countries"
    if not check:
        dest.mkdir(parents=True, exist_ok=True)
    codes = set(read(DATA / "countries.json"))
    counts = Counter()
    for code in sorted(codes):
        rows = []
        used_sources = set()
        for year in range(START, END + 1):
            fields = select_year(code, year, collections, ons, net, sources)
            for field, item in fields.items():
                if item is not None:
                    used_sources.update(item["sourceIds"])
                    counts[field, item["kind"]] += 1
            rows.append({"year": year, **fields})
        payload = {"country": code, "minYear": START, "maxYear": END,
                   "sources": {key: sources[key] for key in sorted(used_sources)}, "years": rows}
        raw = (json.dumps(payload, separators=(",", ":"), ensure_ascii=False) + "\n").encode()
        path = dest / (code + ".json")
        if check:
            if raw != path.read_bytes():
                raise ValueError(f"National output differs for {code}")
        else:
            path.write_bytes(raw)
    if codes != {p.stem for p in dest.glob("*.json")}:
        raise ValueError("Unexpected output country codes")
    print("Reconciled" if check else "Built", len(codes), "national series,", START, "to", END)
    for (metric, kind), n in sorted(counts.items()):
        print(f"  {metric}, {kind}: {n:,} country-years")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Reconcile existing files without writing.")
    main(parser.parse_args().check)
