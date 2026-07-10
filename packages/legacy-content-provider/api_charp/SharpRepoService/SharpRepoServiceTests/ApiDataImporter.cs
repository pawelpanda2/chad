using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using SharpRepoServiceTests.JsonObjects;
using TinderImport;

public class ApiDataImporter
{
    private readonly YamlWorker yamlWorker;
    private string accountId;
    private readonly string exportedApiDataFolderPath;
    private readonly string meString = "_ja";
    private readonly string sheString = "ona";

    public ApiDataImporter(string exportedApiDataFolderPath)
	{
        yamlWorker = new YamlWorker();
        this.exportedApiDataFolderPath = exportedApiDataFolderPath;
        if (!Directory.Exists(exportedApiDataFolderPath))
        {
            Directory.CreateDirectory(exportedApiDataFolderPath);
            //Todo - Try to import again
        }
    }

    internal Profile GetProfile(string accountId)
    {
        this.accountId = accountId;
        var accountFoldersList = Directory.GetDirectories(exportedApiDataFolderPath);
        var accountFolderPath = accountFoldersList.SingleOrDefault(x => Path.GetFileNameWithoutExtension(x).EndsWith(accountId));
        var allFilePaths = Directory.GetFiles(accountFolderPath);

        var filePath = allFilePaths.Where(x => Path.GetExtension(x) == ".txt")
        .Single(x => Path.GetFileName(x) == accountId + ".txt");
        
        //var profile = DeserializeYamlByJson<Profile>(filePath);
        var profile2 = yamlWorker.Deserialize<Profile>(filePath);
        //var profile3 = JsonConvert.SerializeObject(profile, Formatting.Indented);

        return profile2;
    }

    internal List<Match> GetMatchesInfos(string accountId)
    {
        this.accountId = accountId;
        var accountFoldersList = Directory.GetDirectories(exportedApiDataFolderPath);
        var accountFolderPath = accountFoldersList.SingleOrDefault(x => Path.GetFileNameWithoutExtension(x).EndsWith(accountId));
        var allFilePaths = Directory.GetFiles(accountFolderPath);
        var apiFilePaths = allFilePaths.Where(x => Path.GetExtension(x) == ".txt")
        .Where(x => Path.GetFileName(x) != accountId + ".txt");

        var ouput = string.Empty;

        var result = new List<Match>();
        foreach (var filePath in apiFilePaths)
        {
            var messages = yamlWorker.DeserializeYamlByJson<Match>(filePath);
            //var messages2 = yamlWorker.Deserialize<Match>(filePath);
            result.Add(messages);
        }

        return result;
    }

    private Message GetMessage(JToken jtoken)
	{
		var text = jtoken["message"].ToString();
        var ownerId = jtoken["from"].ToString();
		var description = string.Empty;
		if (ownerId == accountId)
		{
            description = meString;
        }
		else
		{
            description = sheString;
        }

        var message = new Message(text, ownerId, description);
		return message;
    }

    
}
