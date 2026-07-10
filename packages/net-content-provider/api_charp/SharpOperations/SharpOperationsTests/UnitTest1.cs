using System.Text.RegularExpressions;
using SharpFileServiceProg.AAPublic;
using SharpOperationsProg.AAPublic;
using SharpOperationsProg.AAPublic.Operations;
using SharpOperationsProg.Operations.UniItemAddress;

namespace SharpOperationsTests;

using OutBorder01 = SharpFileServiceProg.AAPublic.OutBorder;
using OutBorder02 = SharpOperationsProg.AAPublic.OutBorder;

public class Tests
{
    private IFileService _file;
    private IOperationsService _operations;
    private IUniAddressOperations _uniAddress;

    [SetUp]
    public void Setup()
    {
        _file = OutBorder01.FileService();
        _operations = OutBorder02.OperationsService(_file);
        _uniAddress = _operations.UniAddress;
    }

    [Test]
    public void Test1()
    {
        string goupFolderPath = "/Users/pawelfluder/Dropbox/ebf8d4ba-06c2-43eb-a201-4d32d13656e4";
        string repoName = "Rama";
            
        // string goupFolderPath = "/Users/pawelfluder/Dropbox/0fc7da8d-3466-4964-a24c-dfc0d0fef87c";
        // string repoName = "Worldline";
        
        string repoFolderPath = goupFolderPath + "/" + repoName;
        int fileCount = Directory.EnumerateFiles(repoFolderPath, "*.*", SearchOption.AllDirectories).Count();
        int subDirCount = Directory.EnumerateDirectories(repoFolderPath, "*.*", SearchOption.AllDirectories).Count();
        int total = fileCount + subDirCount;
        
        List<string> addressesList = _uniAddress
            .GetAllAddressesInOneRepo(repoFolderPath);
        
    }

    [Test]
    public void Test2()
    {
        string pattern = @"^\d{2}-(0[0-9]|1[0-2])-(0[0-9]|[12][0-9]|3[01])$";
        Regex regex = new(pattern);

        string[] testStrings = { "99-12-31", "20-00-15", "45-07-00", "99-13-10", "22-06-32", "10-10-10" };

        foreach (var str in testStrings)
        {
            bool s01 = _operations.Date
                .TryParse(str, out var result);
            Console.WriteLine($"{str}: {regex.IsMatch(str)}");
        }
    }
}
