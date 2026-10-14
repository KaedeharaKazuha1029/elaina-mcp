# Full corpus audit

Upstream: https://github.com/KaedeharaKazuha1029/elaina-skill
Commit: b940fe08dec019807644f5bf5497d6299cf77ef6

The source contains 296 complete original files, 296 complete summary files, and 960 indexed records (296 summaries and 664 raw chunks). All 960 records are byte-equivalent UTF-8 text to their source files at the recorded Unicode offsets. Concatenating all raw chunks reconstructs all 296 original files without gaps. Original text contains 2,956,242 Unicode characters.

The upstream canon-manifest.json has 592 stale file hashes. Its path inventory remains correct, but its digests do not match this commit's actual files. The original manifest is preserved unchanged in private storage. The deployment manifest is regenerated from actual bytes at the locked commit and carries per-file SHA-256 plus per-record canonical JSON hashes. No changes are pushed to the upstream repository.

All 601 uploaded source objects are preserved byte for byte, including the original SQLite index with FTS tables, source map, aliases, original manifest, article/persona indexes, and index/retrieval/validation scripts. The D1 adaptation retains all 960 records and original content hashes. Runtime retrieval uses the reviewed JavaScript port; Python source and index remain preserved as private artifacts, without claiming that Workers execute Python.

Storage: private D1 index plus private R2 full files. Corpus import is separate from schema migrations. Provisioning accepts only the locked manifest, validates every record/file hash, rereads every R2 object after upload, and publishes a completion receipt only after all 601 objects and all 960 records verify. The importer seals immediately on successful finalization; its secret is then removed.

Local tests: 10 passed, including actual import of all files/records and complete paginated reconstruction of all 592 original/summary files through the runtime file reader. Original evidence records now support Unicode offset pagination. Two new read-only MCP tools list corpus files and read full files by pages; the ten original tools remain.
