using SharpFileServiceProg.Operations.Headers;
using SharpFileServiceProg.Operations.Path;

namespace SharpFileServiceTests
{
    [TestClass]
    public class UnitTest4
    {
        private readonly HeadersOperations headersOp;

        [TestMethod]
        public void Method02()
        {
            var findFolder = new FolderFinder();
            var name = "1234";
            var path = "C:";
            var exp = "0(0,5)";
            var result = findFolder.FindFolder(name, path, exp);
        }


        [TestMethod]
        public void Method01()
        {
            var findFolder = new FolderFinder();
            var expr01 = "(2(2,4)";
            var expr02 = "(2,4)";
            var expr03 = "-121234(-257,-3423)";
            var expr04 = "(2343243)";

            var success01 = findFolder.FindRange(expr01, out int move01,
                out (int left, int right) range01);

            var success02 = findFolder.FindRange(expr02, out int move02,
                out (int left, int right) range02);

            var success03 = findFolder.FindRange(expr03, out int move03,
                out (int left, int right) range03);

            var success04 = findFolder.FindRange(expr04, out int move04,
                out (int left, int right) range04);
        }
    }
}