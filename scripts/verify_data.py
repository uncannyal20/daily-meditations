#!/usr/bin/env python3
"""
Verify and validate data/meditations.json
"""
import json
import os

with open('data/meditations.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

print(f"Total books: {len(data['books'])}")
print(f"Total meditations: {len(data['meditations'])}")

books_count = {}
for m in data['meditations']:
    b = m['bookId']
    books_count[b] = books_count.get(b, 0) + 1

    # Basic field checks
    assert m['title'], f"Missing title in {m['id']}"
    assert m['bookTitle'], f"Missing bookTitle in {m['id']}"
    assert len(m['paragraphs']) > 0 or (m.get('sections') and any(m['sections'].values())), f"No content in {m['id']}"

print("Book distributions:")
for b, c in books_count.items():
    print(f" - {b}: {c} entries")

# Check samples
for b in ['my_daily_bread', 'the_imitation_of_christ', 'the_joy_of_knowing_christ']:
    sample = next(m for m in data['meditations'] if m['bookId'] == b)
    print(f"\n--- Sample from {sample['bookTitle']} ---")
    print(f"ID: {sample['id']}")
    print(f"Title: {sample['title']}")
    print(f"Division: {sample['division']}")
    print(f"Subtitle: {sample.get('subtitle')}")
    print(f"Paragraphs count: {len(sample['paragraphs'])}")

print("\nData integrity check PASSED!")
