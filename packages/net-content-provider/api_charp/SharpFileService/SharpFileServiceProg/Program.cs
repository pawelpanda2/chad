namespace SharpFileServiceProg;

class Program
{
    static void Main(string[] args)
    {
        Test03();
    }

    private static void Test03()
    {
        var pathsList = new List<string>()
        {
            "D:/01_Synchronized/01_Programming_Files/ebf8d4ba-06c2-43eb-a201-4d32d13656e4/Rama/03/06",
        };

        //var fileService = new FileService();
        //var xmlWorker = new XmlWorker(fileService);
        //var xmlDocument = xmlWorker.CreateNotepadWorkspaceNode(pathsList);

        //var workspaceFilePath = pathsList[0] + "/" + "01" + "/" + "workspace.txt";
        //if (File.Exists(workspaceFilePath))
        //{
        //    File.Delete(workspaceFilePath);
        //}

        //xmlDocument.Save(workspaceFilePath);
    }

    private static void Test01()
    {
        //var folderAnlyzer = new FolderAnalyzer();
        //var path01 = "C:/02_Synch/Dropbox";
        //var directories = Directory.GetDirectories(path01);

        //foreach (var dir in directories)
        //{
        //    folderAnlyzer.Analysis01(dir);
        //}

        //folderAnlyzer.Analysis01(path01);
    }

    private static void Test02()
    {
        //var path = "D:/01_Synchronized/01_Programming_Files/ebf8d4ba-06c2-43eb-a201-4d32d13656e4/Rama/03/06/01/workspace";
        //var fileService = new FileService();
        //var xmlWorker = new XmlWorker(fileService);
        //xmlWorker.Load(path);
    }
}