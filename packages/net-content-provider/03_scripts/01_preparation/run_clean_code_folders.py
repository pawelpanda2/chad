import sys
mainPath = "e:/03_synch/03_files_programming/03_github/NotesSystem"
from clean_code_folders2 import clean

folders = [
    mainPath + "/" + "02_settings",
    mainPath + "/" + "03_projects",
    mainPath + "/" + "05_projects",
    mainPath + "/" + "08_projects"
]

for folder in folders:
    print(f"\n--- Przetwarzanie folderu: {folder} ---")
    clean(folder)
    # Przekazujemy folder przez stdin do input()
    #subprocess.run([sys.executable, script], input=folder+'\n', text=True)
