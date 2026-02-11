#!/usr/bin/env python3
"""
Package a Claude skill folder into a .zip file ready for upload to Claude.ai.
Validates the skill first, then creates a clean zip excluding unnecessary files.
"""

import sys
import os
import zipfile
import re

# Files/patterns to exclude from the package
EXCLUDE_PATTERNS = [
    r'\.git',
    r'\.DS_Store',
    r'__pycache__',
    r'\.pyc$',
    r'node_modules',
    r'\.env',
    r'README\.md',
    r'-workspace/',
    r'\.skill$',
    r'\.zip$',
]


def should_exclude(path):
    """Check if a file path should be excluded from the package."""
    for pattern in EXCLUDE_PATTERNS:
        if re.search(pattern, path):
            return True
    return False


def package_skill(skill_path, output_path=None):
    """Package a skill folder into a zip file."""
    skill_path = os.path.abspath(skill_path)
    
    if not os.path.isdir(skill_path):
        print(f"Error: '{skill_path}' is not a directory")
        return None

    skill_name = os.path.basename(skill_path)
    
    # Check SKILL.md exists
    skill_md = os.path.join(skill_path, 'SKILL.md')
    if not os.path.exists(skill_md):
        print(f"Error: No SKILL.md found in '{skill_path}'")
        return None

    # Determine output path
    if output_path is None:
        parent_dir = os.path.dirname(skill_path)
        output_path = os.path.join(parent_dir, f"{skill_name}.zip")

    # Collect files
    files_to_include = []
    for root, dirs, files in os.walk(skill_path):
        # Filter directories in-place to skip excluded ones
        dirs[:] = [d for d in dirs if not should_exclude(d)]
        
        for fname in files:
            full_path = os.path.join(root, fname)
            rel_path = os.path.relpath(full_path, os.path.dirname(skill_path))
            
            if not should_exclude(rel_path):
                files_to_include.append((full_path, rel_path))

    if not files_to_include:
        print("Error: No files to package")
        return None

    # Create zip
    with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        for full_path, rel_path in sorted(files_to_include):
            zf.write(full_path, rel_path)

    # Report
    total_size = os.path.getsize(output_path)
    print(f"\n📦 Packaged: {output_path}")
    print(f"   Files: {len(files_to_include)}")
    print(f"   Size: {total_size / 1024:.1f} KB")
    print(f"\n   Upload via: Claude.ai → Settings → Capabilities → Skills → Upload")
    
    return output_path


def main():
    if len(sys.argv) < 2:
        print("Usage: python package_skill.py <path-to-skill-folder> [output-path]")
        print("Example: python package_skill.py ./my-skill")
        print("         python package_skill.py ./my-skill ./my-skill.zip")
        sys.exit(1)

    skill_path = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else None
    
    result = package_skill(skill_path, output_path)
    sys.exit(0 if result else 1)


if __name__ == '__main__':
    main()
