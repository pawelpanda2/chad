namespace SharpFileServiceProg.Service2;

public partial class FileService2
{
    public class FileServiceRepoWorker
    {
        public string IndexToString(int index)
        {
            if (index < 10)
            {
                return "0" + index;
            }
            if (index < 100)
            {
                return index.ToString();
            }

            throw new Exception();
        }

        public int GetLastItemNumberInFolderItem(string path)
        {
            var subFoldersPaths = Directory.GetDirectories(path);

            if (subFoldersPaths.Length == 0)
            {
                return 0;
            }

            var folders = subFoldersPaths.Select(x => Path.GetFileName(x));
            var indexes = folders.Where(x => int.TryParse(x, out var result)).Select(x => int.Parse(x));
            var max = indexes.Max();
            return max;
        }

        public string GetNameByLocalPath(string localPath)
        {
            var fileName = localPath + "/" + "nazwa.txt";
            if (File.Exists(fileName))
            {
                var name = File.ReadAllLines(fileName).FirstOrDefault();
                return name;
            }

            return null;
        }

        public string GetTypeByLocalPath(string localPath)
        {
            var fileName = localPath + "/" + "index.php";
            if (File.Exists(fileName))
            {
                var lines = File.ReadAllLines(fileName);
                var typeLine = lines.FirstOrDefault(x => x.Contains("define('TYPE',"));
                if (typeLine != null)
                {
                    var type = typeLine.Split("\"")[1];
                    return type;
                }
            }

            return null;
        }

        private static char slash = '/';
        private static string git = ".git";
        //private readonly ServerInfo serverInfo;

        //public RepoWorker(ServerInfo serverInfo)
        //{
        //    this.serverInfo = serverInfo;
        //}

        public (Guid, string) GetRepo(string path)
        {
            var repoName = Path.GetFileName(path);
            var groupName = Path.GetFileName(Path.GetDirectoryName(path));
            var repo = GetRepo(groupName, repoName);

            return repo;
        }

        public (Guid, string) GetRepo(string groupName, string repoName)
        {
            var success = Guid.TryParse(groupName, out Guid group);

            if (success)
            {
                var repo = (group, repoName);
                return repo;
            }

            return (Guid.Empty, null);
        }

        //public string GetLocalPath((Guid, string) repo)
        //{
        //    var path = serverInfo.LocalStartPath + slash + repo.Item1 + slash + repo.Item2;
        //    return path;
        //}

        public (Guid, string) GetRepoFromAgruments(string[] args)
        {
            if (args.Length == 1)
            {
                var curPath = Environment.CurrentDirectory;
                var repo = GetRepo(curPath);
                return repo;
            }

            if (args.Length == 2 &&
                Directory.Exists(args[1]))
            {
                var repo = GetRepo(args[1]);
                return repo;
            }

            if (args.Length == 3)
            {
                var repo = GetRepo(args[1], args[2]);
                return repo;
            }

            return default;
        }



        //public List<string> GetAllMsgFolders()
        //{
        //    var guid = "ebf8d4ba-06c2-43eb-a201-4d32d13656e4";
        //    var path = serverInfo.LocalStartPath + "/" + guid;
        //    var allDirectories = Directory.GetDirectories(path);
        //    var msg = "Msg";
        //    var msgDirectories = allDirectories.Where(x => Path.GetFileName(x).StartsWith(msg)).ToList();
        //    return msgDirectories;
        //}

        //    public string GetLastTextItemPath()
        //    {
        //        var searchPath = rootPath + "/" + "items/text";
        //        var subFoldersPaths = Directory.GetDirectories(searchPath);
        //        var folders = subFoldersPaths.Select(x => Path.GetFileName(x));
        //        var gg = folders.OrderByDescending(x => x);
        //        var last = searchPath + "/" + gg.First() + "/" + "index.php";
        //        return last;
        //    }

        //    public void CreateNewTextItem(string path, string name)
        //    {
        //        Directory.CreateDirectory(path);
        //        var nameFilePath = path + "/" + nameFileString;
        //        var contentFilePath = path + "/" + contentFileString;
        //        using (File.Create(nameFilePath))
        //        {
        //        }

        //        File.WriteAllText(nameFilePath, name);

        //        using (File.Create(contentFilePath))
        //        {
        //        }

        //        var indexPath = GetLastTextItemPath();
        //        var newFilePath = path + "/" + "index.php";
        //        File.Copy(indexPath, newFilePath);
        //    }

        //    public string CreateTextItemInFolderItem(string path, string name)
        //    {
        //        var index = GetLastItemNumberInFolderItem(path);
        //        var nextIndex = IndexToString(index + 1);
        //        var newTextItemPath = path + "/" + nextIndex;
        //        CreateNewTextItem(newTextItemPath, name);

        //        return nextIndex;
        //    }
        //}

        //public string GetLocalHtttp(Address address)
        //{
        //    var fileName = rootLocalHttp + "/" + "nazwa.txt";
        //    var gg3 = address.Indexes.Select(x => IndexToString(x));
        //    var gg2 = string.Join("/", gg3);
        //    var path = rootLocalHttp + slash + address.Repo.Item1 + slash + address.Repo.Item2 + slash + gg2;
        //    return path;
        //}

        //public string GetRelativeAddress(Address address)
        //{
        //    var fileName = rootLocalHttp + "/" + "nazwa.txt";
        //    var gg3 = address.Indexes.Select(x => IndexToString(x));
        //    var gg2 = string.Join("/", gg3);
        //    var path = address.Repo.Item1 + slash + address.Repo.Item2 + slash + gg2;
        //    return path;
        //}

        /// <inheritdoc/>

        //public IEnumerable<Address> GetAddressInFolder((Guid, string) repo, List<string> subNames)
        //{
        //    var place = string.Join(slash, subNames);
        //    var folderPath = rootPath + slash + repo.Item1 + slash + repo.Item2;
        //    var subFoldersPaths = Directory.GetDirectories(folderPath);
        //    var names = new List<Address>();

        //    foreach (var subFolderPath in subFoldersPaths)
        //    {
        //        var fileName = subFolderPath + "/" + "nazwa.txt";
        //        if (File.Exists(fileName))
        //        {
        //            var name = File.ReadAllLines(fileName).FirstOrDefault();
        //            var subFolder = Path.GetFileName(subFolderPath);
        //            var index = int.Parse(subFolder);
        //            //var address = new Address(repo, index);
        //            names.Add(null);
        //        }
        //    }

        //    return names;
        //}

        //public string GetAddressLocalPath(Address address)
        //{
        //    var gg3 = address.Indexes.Select(x => IndexToString(x));
        //    var gg2 = string.Join("/", gg3);
        //    var path = rootPath + slash + address.Repo.Item1 + slash + address.Repo.Item2 + slash + gg2;
        //    return path;
        //}

        //public string GetLocalRelativePath(Address address)
        //{
        //    var gg3 = address.Indexes.Select(x => IndexToString(x));
        //    var gg2 = string.Join("/", gg3);
        //    var path = address.Repo.Item1 + slash + address.Repo.Item2 + slash + gg2;
        //    return path;
        //}

        //public (string, string) GetNameAndLocalPath(Address address)
        //{
        //    var localPath = GetAddressLocalPath(address);
        //    var name = GetNameByLocalPath(localPath);

        //    return (name, localPath);
        //}

        //public (string, string, string) GetNameQRelativeAddressQRepoName(Address address)
        //{
        //    var relativeAddress = GetRelativeAddress(address);

        //    var localPath = GetAddressLocalPath(address);
        //    var name = GetNameByLocalPath(localPath);

        //    return (name, relativeAddress, address.Repo.Item2);
        //}

        //public List<Address> GetAllSubAddress(Address address)
        //{
        //    var localPath = GetAddressLocalPath(address);
        //    var subFoldersPaths = Directory.GetDirectories(localPath);
        //    var subAddresses = subFoldersPaths.Select(x => GetFolderAddress(x)).ToList();

        //    return subAddresses;
        //}

        //public Address GetFolderAddress(string localPath)
        //{
        //    var temp = localPath.Replace(rootPath, "");
        //    string pattern = @"([a-z0-9]{8}[-][a-z0-9]{4}[-][a-z0-9]{4}[-][a-z0-9]{4}[-][a-z0-9]{12})";
        //    var guids = Regex.Matches(temp, pattern);
        //    var guidString = guids.First().ToString();
        //    var guid = new Guid(guidString);
        //    temp = temp.Replace(guidString, "");
        //    temp = temp.Replace("//", "");
        //    temp = temp.Replace("\\", "/");
        //    var gg = temp.Split("/").ToList();
        //    var repo = (guid, gg.First());
        //    gg.RemoveAt(0);
        //    var indexes = gg.Select(x => int.Parse(x)).ToList();

        //    var address = new Address(repo, indexes);

        //    return address;
        //}


    }
}