import os
import shutil
import sys

CODE_EXTENSIONS = {
    ".cs", ".csproj", ".sln", ".config", ".json", ".xml", ".md", ".txt", ".editorconfig", ".gitignore", ".props", ".scpt", "xsd", ".css", ".map", ".html", ".razor", ".js", ".conf", ".py"
}

def remove_bin_obj_folders(root_folder):
    found = []
    for dirpath, dirnames, filenames in os.walk(root_folder):
        for d in list(dirnames):
            if d.lower() in ("bin", "obj"):
                full_path = os.path.join(dirpath, d)
                found.append(full_path)
    if found:
        print("\nZnalezione katalogi bin/obj do usunięcia:")
        for f in found:
            print(f)
    for f in found:
        print(f"Usuwam folder: {f}")
        shutil.rmtree(f)

def find_non_code_files(root_folder):
    non_code_files = []
    for dirpath, dirnames, filenames in os.walk(root_folder):
        for f in filenames:
            _, ext = os.path.splitext(f)
            if ext.lower() not in CODE_EXTENSIONS:
                non_code_files.append(os.path.join(dirpath, f))
    return non_code_files

def clean(folder):
    # 1) Usunięcie wszystkich folderów bin i obj
    remove_bin_obj_folders(folder)

    # 2) Wyszukanie i wypisanie plików nie będących kodem
    non_code_files = find_non_code_files(folder)
    if non_code_files:
        print("\nZnalezione pliki nie będące kodem:")
        i = 0
        for f in non_code_files:
            print(str(i) + " " + f)
            i+= 1
    else:
        print("\nNie znaleziono plików nie będących kodem.")

    # 3) Zapytanie o potwierdzenie usunięcia
    if non_code_files:
        # Jeśli drugi argument to 'auto', automatycznie usuń pliki
        auto_confirm = len(sys.argv) > 2 and sys.argv[2].lower() == "auto"
        if auto_confirm:
            confirm = "tak"
        else:
            try:
                confirm = input("\nCzy chcesz usunąć powyższe pliki? (tak/nie): ").strip().lower()
            except EOFError:
                print("Brak potwierdzenia, nie usuwam plików.")
                confirm = "nie"
        if confirm == "tak":
            # 4) Usunięcie plików jeśli potwierdzone
            i = 0
            for f in non_code_files:
                try:
                    os.remove(f)
                    print(f"Usunięto: " + str(i) + " " + {f})
                    i+= 1
                except Exception as e:
                    print(f"Błąd przy usuwaniu {f}: {e}")
        else:
            print("Nie usunięto plików.")
    print("Koniec programu.")

# if __name__ == "__main__":
#     main()