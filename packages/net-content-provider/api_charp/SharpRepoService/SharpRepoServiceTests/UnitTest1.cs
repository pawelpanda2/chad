using SharpFileServiceProg.AAPublic;
using SharpFileServiceProg.Service;
using SharpRepoServiceProg.AAPublic;
using TinderImport;
using OutBorder01 = SharpFileServiceProg.AAPublic.OutBorder;
using OutBorder02 = SharpRepoServiceProg.AAPublic.OutBorder;

namespace SharpRepoServiceTests
{
    [TestClass]
    public class UnitTest1
    {
        private readonly IFileService fileService;
        private readonly IRepoService repoService;
        private readonly string exportedPath;

        public UnitTest1()
        {
            fileService = OutBorder01.FileService();
            repoService = OutBorder02.RepoService(fileService);
        }

        //[TestMethod]
        //public void RecreateWorkspace()
        //{
        //    var repo = "appData";
        //    var localPath = repoService.Methods.GetRepoPath(repo);
        //    CreateWorkspace(localPath);
        //}

        //[TestMethod]
        //public void TestMethod1()
        //{
        //    var repoService = new RepoService();
        //    var all = repoService.Methods.GetAllRepoPaths();
        //}

        //[TestMethod]
        //public void TestMethod4()
        //{
        //    var tmp = "63accf430996fb0100a34a72";
        //    var tmp2 = "2022-12-28_paweł_63accf430996fb0100a34a72";
        //    TestMethod2(tmp, tmp2);

            
        //}

        //[TestMethod]
        //public void TestMethod3()
        //{
        //    var dirs = Directory.GetDirectories(exportedPath)
        //        .Select(x => Path.GetFileName(x))
        //        .ToList();
        //    dirs.RemoveAll(x => Path.GetFileName(x) == ".git");

        //    foreach (var dir in dirs)
        //    {
        //        var gg = dir.Split('_');
        //        TestMethod2(gg[2], dir);
        //    }

        //    var repo = "appData";
        //    var localPath = repoService.Methods.GetRepoPath(repo);
        //    CreateWorkspace(localPath);
        //}

        
        //public void TestMethod2(string accoutId, string name)
        //{
        //    // arrange
        //    //var accoutId = "62c89c9a4e95f00100eb6623";
        //    var repo = "appData";
            
        //    var newAddress = repoService.Methods.CreateFolder((repo, ""), "tinder");
        //    var newAddress2 = repoService.Methods.CreateFolder(newAddress, "exportedApiData");
        //    var newAddress3 = repoService.Methods.CreateFolder(newAddress2, name);
        //    var namesAndContentsList = GetNamesAndContents(accoutId);

        //    // act
        //    repoService.Methods.SaveElementsList(newAddress3, namesAndContentsList);

        //    // assert
            
        //}

        public List<(string, string)> GetNamesAndContents(string accoutId)
        {
            string exportedApiDataFolderPath = "D:/01_Synchronized/01_Programming_Files/8c0f7763-7149-4b4d-9d6a-b28d3984552f/01_projects/PythonTinderApiDataExport/Output/ExportedApiData";
            var apiDataImporter = new ApiDataImporter(exportedApiDataFolderPath);
            var matches = apiDataImporter.GetMatchesInfos(accoutId);
            var profile = apiDataImporter.GetProfile(accoutId);
            var yamlWorker = new YamlWorker();
            var namesAndContentsList = new List<(string _id, string)>();
            namesAndContentsList.AddRange(matches.Select(x =>
                (x._id, yamlWorker.Serialize(x)
            )).ToList());
            //int tmp2 = namesAndContentsList.FindIndex(x => x._id == accoutId);
            //var profileItem = namesAndContentsList[tmp2];
            //namesAndContentsList.RemoveAt(tmp2);
            namesAndContentsList.Insert(0, ("profile", yamlWorker.Serialize(profile)));

            return namesAndContentsList;
        }

        //public void CreateWorkspace(string path)
        //{
        //    var gg2 = new List<string>() { path };
        //    var xmlWorker = new XmlWorker(new FileService());
        //    var xmlDocument = xmlWorker.CreateNotepadWorkspaceNode(gg2);
        //    xmlDocument.Save(path + "/" + "workspace.txt");
        //}
    }
}