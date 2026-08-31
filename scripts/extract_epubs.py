#!/usr/bin/env python3
"""
EPUB Extraction Pipeline for Daily Devotion & Meditation Web App.
Extracts meditation units from:
1. My Daily Bread (Fr. Anthony J. Paone, S.J.) - 197 Chapters across 3 Books
2. The Imitation of Christ (Thomas à Kempis) - 114 Chapters across 4 Books
3. The Joy of Knowing Christ (Pope Benedict XVI) - 55 Gospel Meditations
Outputs clean, verified JSON dataset to data/meditations.json.
"""

import os
import re
import json
import ebooklib
from ebooklib import epub
from bs4 import BeautifulSoup


def clean_text(text):
    if not text:
        return ""
    text = re.sub(r'[\r\n\t]+', ' ', text)
    text = re.sub(r'\s{2,}', ' ', text)
    text = text.replace('“', '"').replace('”', '"')
    text = text.replace('’', "'").replace('‘', "'")
    text = text.replace('–', '-').replace('—', ' - ')
    return text.strip()


def parse_my_daily_bread(epub_path):
    print("-> Parsing My Daily Bread...")
    book = epub.read_epub(epub_path)
    entries = []
    
    current_book = "Book One: The Way of Purification"
    current_part = "Part One: Conversion"
    current_section = "A. A Thoughtful Glance at Human Life"

    docs = list(book.get_items_of_type(ebooklib.ITEM_DOCUMENT))

    for doc in docs:
        soup = BeautifulSoup(doc.get_content(), 'html.parser')
        text = soup.get_text()

        # Update current Book division
        if "BOOK ONE" in text and "Purification" in text and "CHAPTER" not in text:
            current_book = "Book One: The Way of Purification"
        elif "BOOK TWO" in text and "Imitation" in text and "CHAPTER" not in text:
            current_book = "Book Two: The Way of Imitation"
        elif "BOOK THREE" in text and "Union" in text and "CHAPTER" not in text:
            current_book = "Book Three: The Way of Union"

        # Update current Part
        part_match = re.search(r'PART\s+(ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN|ELEVEN|TWELVE)[\s:\n]+([^\n\r]+)', text)
        if part_match and "CHAPTER" not in text:
            p_num = part_match.group(1).title()
            p_title = clean_text(part_match.group(2))
            p_title = re.split(r'[A-Z]\.\s', p_title)[0].strip()
            current_part = f"Part {p_num}: {p_title}"

        # Update Section header if present
        for p in soup.find_all(['p', 'h2', 'h3']):
            pt = clean_text(p.get_text())
            if re.match(r'^[A-Z]\.\s+[A-Za-z\s’\',-]+$', pt) and len(pt) < 60 and "CHAPTER" not in pt:
                current_section = pt

        # Extract Chapter if present
        ch_match = re.search(r'CHAPTER\s+(\d+)', text)
        if ch_match:
            ch_num = int(ch_match.group(1))

            paras = [clean_text(p.get_text()) for p in soup.find_all(['p', 'h1', 'h2', 'h3', 'blockquote']) if clean_text(p.get_text())]

            title = ""
            for i, p in enumerate(paras):
                if f"CHAPTER {ch_num}" in p:
                    if i + 1 < len(paras) and "CHRIST:" not in paras[i+1] and not paras[i+1].startswith("CHAPTER"):
                        title = paras[i+1]
                        # Clean if title contains "CHRIST Spiritual Communion"
                        if title.startswith("CHRIST "):
                            title = title[7:].strip()
                    break

            christ_paras = []
            think_paras = []
            pray_paras = []
            section = "intro"

            for p in paras:
                if p.startswith(f"CHAPTER {ch_num}") or p == title or p == current_book or p == current_part:
                    continue
                if p.startswith("CHRIST:"):
                    section = "christ"
                    p_clean = p[7:].strip()
                    if p_clean:
                        christ_paras.append(p_clean)
                    continue
                elif p.startswith("THINK:"):
                    section = "think"
                    p_clean = p[6:].strip()
                    if p_clean:
                        think_paras.append(p_clean)
                    continue
                elif p.startswith("PRAY:"):
                    section = "pray"
                    p_clean = p[5:].strip()
                    if p_clean:
                        pray_paras.append(p_clean)
                    continue

                if section == "christ":
                    christ_paras.append(p)
                elif section == "think":
                    think_paras.append(p)
                elif section == "pray":
                    pray_paras.append(p)
                elif section == "intro" and p:
                    christ_paras.append(p)

            if title or christ_paras:
                entries.append({
                    "id": f"mdb_{len(entries)+1}",
                    "bookId": "my_daily_bread",
                    "bookTitle": "My Daily Bread",
                    "author": "Fr. Anthony J. Paone, S.J.",
                    "division": current_book,
                    "part": current_part,
                    "section": current_section,
                    "chapterNumber": ch_num,
                    "chapterLabel": f"Chapter {ch_num}",
                    "title": title or f"Chapter {ch_num}",
                    "subtitle": f"{current_book} · {current_part}",
                    "scripture": "",
                    "sections": {
                        "christ": christ_paras,
                        "think": think_paras,
                        "pray": pray_paras
                    },
                    "paragraphs": christ_paras + ["THINK:"] + think_paras + ["PRAY:"] + pray_paras,
                    "estimatedMinutes": 15
                })

    print(f"   Successfully parsed {len(entries)} chapters from My Daily Bread.")
    return entries


def parse_imitation_of_christ(epub_path):
    print("-> Parsing The Imitation of Christ...")
    book = epub.read_epub(epub_path)
    entries = []

    current_book = "Book One: Admonitions Profitable for the Spiritual Life"

    docs = list(book.get_items_of_type(ebooklib.ITEM_DOCUMENT))

    for doc in docs:
        soup = BeautifulSoup(doc.get_content(), 'html.parser')
        text = soup.get_text()

        # Skip preface, TOC, footnotes documents
        if doc.get_name() in ['titlepage.xhtml', 'index_split_000.html', 'index_split_001.html', 'index_split_002.html', 'index_split_003.html', 'index_split_122.html']:
            continue

        if "THE FIRST BOOK" in text and "ADMONITIONS" in text and "Chapter" not in text:
            current_book = "Book One: Admonitions Profitable for the Spiritual Life"
            continue
        elif "THE SECOND BOOK" in text and "ADMONITIONS" in text and "Chapter" not in text:
            current_book = "Book Two: Admonitions Concerning the Inner Life"
            continue
        elif "THE THIRD BOOK" in text and "CONSOLATION" in text and "Chapter" not in text:
            current_book = "Book Three: On Inward Consolation"
            continue
        elif "THE FOURTH BOOK" in text and "SACRAMENT" in text and "Chapter" not in text:
            current_book = "Book Four: Of the Sacrament of the Altar"
            continue

        ch_match = re.search(r'Chapter\s+([IVXLCDM]+|\d+)\.?\s*([^\n\r]+)', text)
        if ch_match:
            ch_num_str = ch_match.group(1)
            raw_title = clean_text(ch_match.group(2))

            # Clean raw_title if it has body text attached
            if ". " in raw_title and len(raw_title) > 80:
                raw_title = raw_title.split(". ")[0].strip()

            paras = [clean_text(p.get_text()) for p in soup.find_all(['p', 'div']) if clean_text(p.get_text())]

            clean_paras = []
            for p in paras:
                if p.startswith(f"Chapter {ch_num_str}") or p.startswith(f"Chapter {ch_num_str}."):
                    # Check if paragraph has text after chapter header line
                    continue
                if p and p != raw_title and not p.startswith("THE ") and "BOOK." not in p and "Digireads" not in p:
                    clean_p = re.sub(r'\[\d+\]', '', p).strip()
                    if clean_p and clean_p != raw_title:
                        clean_paras.append(clean_p)

            # If clean_paras is empty because the whole text was in the chapter heading paragraph
            if not clean_paras:
                for p in soup.find_all(['p', 'div']):
                    txt = clean_text(p.get_text())
                    if txt.startswith(f"Chapter {ch_num_str}"):
                        # Extract everything after the title
                        parts = txt.split(raw_title, 1)
                        if len(parts) > 1 and parts[1].strip():
                            body_txt = re.sub(r'\[\d+\]', '', parts[1]).strip()
                            clean_paras.append(body_txt)

            if clean_paras:
                entries.append({
                    "id": f"ioc_{len(entries)+1}",
                    "bookId": "the_imitation_of_christ",
                    "bookTitle": "The Imitation of Christ",
                    "author": "Thomas à Kempis",
                    "division": current_book,
                    "part": current_book.split(":")[0].strip() if ":" in current_book else "",
                    "section": "",
                    "chapterNumber": len(entries) + 1,
                    "chapterLabel": f"Chapter {ch_num_str}",
                    "title": raw_title or f"Chapter {ch_num_str}",
                    "subtitle": current_book,
                    "scripture": "",
                    "sections": {
                        "body": clean_paras
                    },
                    "paragraphs": clean_paras,
                    "estimatedMinutes": 15
                })

    print(f"   Successfully parsed {len(entries)} chapters from The Imitation of Christ.")
    return entries


def parse_joy_of_knowing_christ(epub_path):
    print("-> Parsing The Joy of Knowing Christ...")
    book = epub.read_epub(epub_path)
    entries = []

    docs = list(book.get_items_of_type(ebooklib.ITEM_DOCUMENT))

    for doc in docs:
        soup = BeautifulSoup(doc.get_content(), 'html.parser')
        text = soup.get_text()

        # Skip title, copyright, contents, preface
        if doc.get_name() in ['index_split_000.html', 'index_split_001.html', 'index_split_002.html', 'index_split_003.html', 'index_split_004.html']:
            continue

        headings = [clean_text(h.get_text()) for h in soup.find_all(['h1', 'h2', 'h3', 'h4']) if clean_text(h.get_text())]
        paras = [clean_text(p.get_text()) for p in soup.find_all('p') if clean_text(p.get_text())]

        match = re.search(r'^\s*(\d+)\.\s+([^\n\r]+)', text)
        if match:
            num = int(match.group(1))
            full_head = clean_text(match.group(2))

            scripture = ""
            title = full_head

            if len(headings) >= 2:
                title = re.sub(r'^\d+\.\s*', '', headings[0]).strip()
                if "INTRODUCTION" in title.upper():
                    title = "Introduction: " + headings[1].strip()
                    scripture = ""
                else:
                    scripture = headings[1].strip()
            elif '/' in full_head:
                parts = full_head.split('/', 1)
                title = parts[0].strip()
                scripture = parts[1].strip()

            title = re.sub(r'^\d+\.\s*', '', title).strip()

            clean_paras = []
            for p in paras:
                if p.startswith(str(num) + ".") or p == scripture or p == title:
                    continue
                if p.startswith("—Pope Benedict XVI") or "MEDITATIONS ON THE GOSPELS" in p or "Copyright" in p:
                    continue
                clean_p = re.sub(r'\[\d+\]', '', p).strip()
                if clean_p and clean_p != title and clean_p != scripture:
                    clean_paras.append(clean_p)

            if clean_paras:
                entries.append({
                    "id": f"jkc_{num}",
                    "bookId": "the_joy_of_knowing_christ",
                    "bookTitle": "The Joy of Knowing Christ",
                    "author": "Pope Benedict XVI",
                    "division": "Meditations on the Gospels",
                    "part": "Gospel Meditations",
                    "section": scripture,
                    "chapterNumber": num,
                    "chapterLabel": f"Meditation {num}",
                    "title": title,
                    "subtitle": scripture or "Gospel Reflection",
                    "scripture": scripture,
                    "sections": {
                        "body": clean_paras
                    },
                    "paragraphs": clean_paras,
                    "estimatedMinutes": 15
                })

    print(f"   Successfully parsed {len(entries)} chapters from The Joy of Knowing Christ.")
    return entries


def main():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    epubs_dir = os.path.join(base_dir, 'epubs')
    data_dir = os.path.join(base_dir, 'data')
    os.makedirs(data_dir, exist_ok=True)

    mdb_path = os.path.join(epubs_dir, 'My_Daily_Bread.epub')
    ioc_path = os.path.join(epubs_dir, 'The_Imitation_of_Christ.epub')
    jkc_path = os.path.join(epubs_dir, 'The_Joy_of_Knowing_Christ.epub')

    mdb_entries = parse_my_daily_bread(mdb_path)
    ioc_entries = parse_imitation_of_christ(ioc_path)
    jkc_entries = parse_joy_of_knowing_christ(jkc_path)

    all_meditations = mdb_entries + ioc_entries + jkc_entries

    books_meta = [
        {
            "id": "my_daily_bread",
            "title": "My Daily Bread",
            "subtitle": "A Summary of the Spiritual Life",
            "author": "Fr. Anthony J. Paone, S.J.",
            "description": "A structured daily guide simplified for reading, reflection (Christ/Think/Pray), and mental prayer.",
            "count": len(mdb_entries),
            "divisions": [
                "Book One: The Way of Purification",
                "Book Two: The Way of Imitation",
                "Book Three: The Way of Union"
            ]
        },
        {
            "id": "the_imitation_of_christ",
            "title": "The Imitation of Christ",
            "subtitle": "Spiritual Admonitions and Inward Consolation",
            "author": "Thomas à Kempis",
            "description": "One of the greatest spiritual classics in Christian history on humility, detachment, and following Christ.",
            "count": len(ioc_entries),
            "divisions": [
                "Book One: Admonitions Profitable for the Spiritual Life",
                "Book Two: Admonitions Concerning the Inner Life",
                "Book Three: On Inward Consolation",
                "Book Four: Of the Sacrament of the Altar"
            ]
        },
        {
            "id": "the_joy_of_knowing_christ",
            "title": "The Joy of Knowing Christ",
            "subtitle": "Meditations on the Gospels",
            "author": "Pope Benedict XVI",
            "description": "Deeply contemplative Gospel reflections on the life, words, and passion of Jesus Christ.",
            "count": len(jkc_entries),
            "divisions": [
                "Meditations on the Gospels"
            ]
        }
    ]

    dataset = {
        "metadata": {
            "title": "Daily Devotion & Meditation Library",
            "version": "1.0.0",
            "totalMeditations": len(all_meditations),
            "generatedAt": "2026-08-30"
        },
        "books": books_meta,
        "meditations": all_meditations
    }

    out_file = os.path.join(data_dir, 'meditations.json')
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(dataset, f, ensure_ascii=False, indent=2)

    print(f"\n[DONE] Successfully wrote {len(all_meditations)} total meditation entries to {out_file}.")


if __name__ == '__main__':
    main()
