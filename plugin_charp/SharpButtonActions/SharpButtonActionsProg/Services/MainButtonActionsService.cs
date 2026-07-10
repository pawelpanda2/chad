using System.Diagnostics;
using SharpButtonActionsProg.AAPublic;
using SharpButtonActionsProg.Workers.Files;
using SharpButtonActionsProg.Workers.Folders;
using SharpButtonActionsProg.Workers.Terminals;
using SharpOperationsProg.AAPublic;
using SharpRepoServiceProg.AAPublic;

namespace SharpButtonActionsProg.Services;

public class MainButtonActionsService : IMainButtonActionsService
{
    private readonly IOperationsService _operations;
    private readonly IRepoService _repo;
    public IFolderWorker Folder { get; }
    public ITerminalWorker Terminal { get; }
    public IFileWorker File { get; set; }

    public MainButtonActionsService(
        IOperationsService operations,
        IRepoService repo)
    {
        _operations = operations;
        _repo = repo;
        Terminal = new TerminalWorker(operations, repo);
        Folder = new FolderWorker(operations, repo);
        File = new FileWorker(operations, repo);
    }

    public void Run(string[] args)
    {
        //var fileName = @"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe";
        //var fileName = @"C:\Program Files\Mozilla Firefox\firefox.exe";
        //var arguments = "D:\02_Xampp\htdocs\Notki\01\02\lista.txt";

        var fileName = @"C:\Program Files\Notepad++\notepad++.exe";

        //var arguments = @"https://facebook.com";
        //var arguments = "https://www.google.com";

        string arguments = string.Empty;


        var argsList = args.Any() ? args.ToList() : new List<string>();


        if (argsList.Count == 0)
        {
            var currentDirectory = Directory.GetCurrentDirectory();
            Process.Start("explorer.exe", currentDirectory);
        }
        else if (argsList.Count == 1)
        {
            arguments = args[0];

            if (Directory.Exists(arguments))
            {
                Process.Start("explorer.exe", arguments);
            }
            else
            {
                Process process = new Process();
                process.StartInfo = new ProcessStartInfo()
                {
                    WindowStyle = ProcessWindowStyle.Hidden,
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    CreateNoWindow = true,
                    StandardOutputEncoding = System.Text.Encoding.UTF8,
                    FileName = fileName,
                    Arguments = arguments,
                };
                process.Start();
            }
        }
    }
}
