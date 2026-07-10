using SharpFileServiceProg.AAPublic;
using SharpFileServiceProg.Service;
using SharpRepoServiceProg.AAPublic;
using SharpRepoServiceTests.Registration;
using OutBorder03 = SharpSetup01Prog.AAPublic.OutBorder;

namespace SharpRepoServiceTests
{
    [TestClass]
    public class PostRefTextTests
    {
        private readonly IFileService fileService;
        private readonly IRepoService repoService;

        public PostRefTextTests()
        {
            OutBorder03.DefaultPreparer().Prepare();
            repoService = MyBorder.OutContainer.Resolve<IRepoService>();
        }

        [TestMethod]
        public void Method01()
        {
            var count = repoService.Methods.GetReposCount();

            (string Repo, string Loca) adrTuple = ("Notes", "");
            var json = repoService.Item.PostParentItem(adrTuple.Repo, adrTuple.Loca, "RefText", "Test01");
        }
    }
}