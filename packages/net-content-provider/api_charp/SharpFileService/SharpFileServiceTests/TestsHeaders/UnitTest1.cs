using SharpFileServiceProg.Operations.CollectionTests;
using SharpFileServiceProg.Operations.Headers;

namespace SharpFileServiceTests
{
    [TestClass]
    public class UnitTest1
    {
        private readonly HeadersOperations headersOp;

        public UnitTest1()
        {
            headersOp = new HeadersOperations();
        }

        [TestMethod]
        public void TestMethod1()
        {
            // arrange
            var elementsList01 = GetElementsList01();
            var cellsIndexes01 = GetCellsIdexes01();
            var neededIndexes01 = GetNeededIdexes01();
            var finalIndexes01 = GetFinalIndexes01();

            // act
            var convertedList = headersOp.Convert.ToLinesList(elementsList01);
            var neededIndexes = headersOp.Select.GetNeededIndexes(cellsIndexes01, convertedList);
            headersOp.Select.CheckCorrectnes(neededIndexes, convertedList);
            var finalIndexes = headersOp.Select.FinalIndexes(neededIndexes, convertedList);

            // assert
            var areEqual1 = new CollectionsAreEqual().Visit(neededIndexes01, neededIndexes);
            Assert.IsTrue(areEqual1);
            var areEqual2 = new CollectionsAreEqual().Visit(finalIndexes01, finalIndexes);
            Assert.IsTrue(areEqual2);
        }

        public List<(string, int, string)> GetElementsList01()
        {
            var cellsIndexes = new List<(string, int, string)>
            {
                ("Header", 2, "1"),
                ("Line", 2, "1"),
                ("Line", 1, "1"),
                ("Header", 2, "1"),
                ("Line", 2, "1"),
                ("Line", 2, "1"),
                ("Line", 2, "1"),
                ("Line", 2, "1"),
                ("Line", 2, "1"),
                ("Line", 2, "1"),
                ("Line", 2, "1"),
                ("Line", 2, "1"),
                ("Line", 2, "1"),
                ("Line", 2, "1"),
                ("Line", 2, "1"),
                ("Line", 2, "1"),
                ("Line", 2, "1"),
                ("Line", 2, "1"),
                ("Line", 2, "1"),
                ("Line", 2, "1"),
                ("Line", 2, "1"),
                ("Line", 2, "1"),
                ("Header", 2, "1"),
                ("Line", 2, "1"),
                ("Line", 2, "1"),
                ("Line", 1, "1"),
                ("Header", 2, "1"),
                ("Line", 2, "1"),
                ("Line", 2, "1"),
                ("Line", 2, "1"),
                ("Line", 2, "1"),
                ("Line", 2, "1"),
                ("Line", 2, "1"),
                ("Line", 2, "1"),
                ("Line", 2, "1"),
                ("Line", 2, "1"),
                ("Line", 2, "1"),
                ("Line", 2, "1"),
                ("Line", 2, "1"),
                ("Line", 2, "1"),
                ("Line", 2, "1"),
                ("Line", 2, "1"),
                ("Header", 2, "1"),
                ("Line", 2, "1"),
                ("Line", 2, "1"),
                ("Line", 2, "1"),
                ("Line", 2, "1"),
                ("Line", 2, "1"),
                ("Line", 2, "1"),
                ("Line", 2, "1"),
                ("Line", 2, "1"),
                ("Line", 2, "1"),
                ("Line", 2, "1"),
                ("Line", 2, "1"),
                ("Header", 2, "1"),
                ("Line", 2, "1"),
                ("Line", 2, "1"),
                ("Line", 1, "1"),
                ("Header", 2, "1"),
                ("Line", 2, "1"),
                ("Line", 2, "1"),
                ("Line", 2, "1"),
                ("Line", 2, "1"),
                ("Line", 2, "1"),
                ("Line", 2, "1"),
                ("Header", 2, "1"),
                ("Line", 2, "1"),
                ("Line", 1, "1"),
            };
            return cellsIndexes;
        }

        public List<int> GetCellsIdexes01()
        {
            var cellsIndexes = new List<int>()
            {
                13,15,18,20,23,25,28,30,33,35,38,40,43,
                45,48,50,53,55,58,60,63,65,68,70,73,75,
                78,80,83,85,88,90,
            };
            return cellsIndexes;
        }

        public List<(string, int)> GetNeededIdexes01()
        {
            var neededIndexes = new List<(string, int)>()
            {
                ("Header", 13),
                ("LinesList", 21),
                ("Header", 27),
                ("LinesList", 35),
                ("Header", 73),
                ("LinesList", 81),
                ("Header", 89),
                ("LinesList", 97),
                ("Header", 129),
                ("LinesList", 137),
                ("Header", 161),
                ("LinesList", 169),
                ("Header", 177),
                ("LinesList", 185),
                ("Header", 199),
                ("LinesList", 207),
            };
            return neededIndexes;
        }

        public List<(string, int)> GetNeededIdexes02()
        {
            var neededIndexes = new List<(string, int)>()
            {
                ("Header", 13),
                ("LinesList", 20),
                ("Header", 23),
                ("LinesList", 30),
                ("Header", 33),
                ("LinesList", 40),
                ("Header", 43),
                ("LinesList", 50),
                ("Header", 53),
                ("LinesList", 60),
                ("Header", 63),
                ("LinesList", 70),
                ("Header", 73),
                ("LinesList", 80),
                ("Header", 83),
                ("LinesList", 90),
            };
            return neededIndexes;
        }

        public List<(string, int)> GetFinalIndexes01()
        {
            var finalIndexes = new List<(string, int)>()
            {
                ("Header", 13),
                ("LinesList", 21),
                ("Header", 27),
                ("LinesList", 35),
                ("Header", 73),
                ("LinesList", 81),
                ("Header", 89),
                ("LinesList", 97),
                ("Header", 129),
                ("LinesList", 137),
                ("Header", 161),
                ("LinesList", 169),
                ("Header", 177),
                ("LinesList", 185),
                ("Header", 199),
                ("LinesList", 207),
            };
            return finalIndexes;
        }
    }
}