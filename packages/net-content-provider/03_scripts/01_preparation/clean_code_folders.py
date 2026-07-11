import os
import sys
import shutil

CODE_EXTENSIONS = {
    ".cs", ".csproj", ".sln", ".config", ".json", ".xml", ".md", ".txt", ".editorconfig", ".gitignore"
}

def is_code_file(filename):
    _, ext = os.path.splitext(filename)
    return ext.lower() in CODE_EXTENSIONS

def contains_only_code_files(folder):
    for root, dirs, files in os.walk(folder):
        for f in files:
            if not is_code_file(f):
                return False
    return True

def remove_bin_obj_folders(folder):
    removed = []
    for root, dirs, files in os.walk(folder):
        for d in dirs:
            if d.lower() in ("bin", "obj"):
                full_path = os.path.join(root, d)
                shutil.rmtree(full_path)
                removed.append(full_path)
    return removed

def main(folders):
    for folder in folders:
        if not os.path.isdir(folder):
            print(f"Folder not found: {folder}")
            continue
        print(f"Checking: {folder}")
        only_code = contains_only_code_files(folder)
        if only_code:
            print(f"  Contains only code files.")
        else:
            print(f"  Contains non-code files.")
        removed = remove_bin_obj_folders(folder)
        for r in removed:
            print(f"  Removed: {r}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python clean_code_folders.py <folder1> <folder2> ...")
        sys.exit(1)
    main(sys.argv[1:])
