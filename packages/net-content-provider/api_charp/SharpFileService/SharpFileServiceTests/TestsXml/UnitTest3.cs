using FileServiceCoreApp;
using SharpFileServiceProg.Service;
using SharpRepoServiceProg.AAPublic;
using OutBorder1 = SharpFileServiceProg.AAPublic.OutBorder;

namespace SharpFileServiceTests
{
    [TestClass]
    public class UnitTest3
    {
        private readonly IFileService fileService;
        private readonly IRepoService repoService;

        public UnitTest3()
        {
            fileService = OutBorder1.FileService();
            repoService = OutBorder.RepoService(fileService);
        }


        [TestMethod]
        public void TestMethod1()
        {
            var path = "D:/01_Synchronized/01_Programming_Files/ebf8d4ba-06c2-43eb-a201-4d32d13656e4/Rama/03/06/06/01/workspace";
            if (!File.Exists(path))
            {
                throw new Exception();
            }
            var xmlWorker = new XmlWorker(fileService);
            xmlWorker.Load(path);
        }
    }
}