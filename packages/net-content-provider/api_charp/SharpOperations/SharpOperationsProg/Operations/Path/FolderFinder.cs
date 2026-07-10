using System.Text.RegularExpressions;
using SharpContainerProg.AAPublic;

namespace SharpOperationsProg.Operations.Path;

public class FolderFinder : IFolderFinder
{
    private bool _ommitLogs = false;
    public string FindFolder(
        string searchFolderName,
        string inputFolderPath,
        string expression,
        Type callerObjectType)
    {
        string inputFolderFullPath = System.IO.Path.GetFullPath(inputFolderPath);
        LogBegin(expression, searchFolderName, callerObjectType);
        
        // expression="3(2,2) - all positive numbers"
        bool success = FindRange(expression, out int move,
            out (int left, int right) range);
        bool success2 = AreAllNumbersPositive(move, range.left, range.right);
        bool s1 = MoveDirectoriesUp(inputFolderFullPath, move, out var startingFolderPath);
        
        LogStartingPosition(inputFolderPath, inputFolderFullPath, startingFolderPath);
        
        string? gg1 = FindFolderInRangeDown(searchFolderName, startingFolderPath, range.right + 1);
        if (gg1 != default)
        {
            LogEnd(true, gg1);
            return gg1;
        }

        string? gg2 = FindFolderInRangeUp(searchFolderName, startingFolderPath, (range.left) + 1);
        
        if (gg2 != default)
        {
            LogEnd(true, gg2);
            return gg2;
        }

        LogEnd(false, "");
        return "";
    }

    private void LogBegin(
        string expression,
        string searchFolderName,
        Type callerObjectType)
    {
        string consoleMsg =
            $"FolderFinder 1) "
            + $"expr: \"{expression}\" "
            + $"searchFolderName: \"{searchFolderName}\" "
            + $"callerObjectType: \"{callerObjectType.Name}\"";
        StaticOkAndError.Ok(consoleMsg, _ommitLogs);
    }

    private void LogStartingPosition(
        string inputFolderPath,
        string inputFolderFullPath,
        string startingFolderPath)
    {
        string consoleMsg =
            $"FolderFinder 2) "
            + $"inputFolderPath: \"{inputFolderPath}\" "
            + $"inputFolderFullPath: \"{inputFolderFullPath}\" "
            + $"startingFolderPath: \"{startingFolderPath}\"";
        StaticOkAndError.Ok(consoleMsg, _ommitLogs);
    }
    
    private void LogEnd(
        bool success,
        string foundPath)
    {
        string consoleMsg = $"FolderFinder 3) "
            + $"Success: \"{success}\" "
            + $"foundPath: \"{foundPath}\" ";
        StaticOkAndError.Ok(consoleMsg, _ommitLogs);
    }

    private bool AreAllNumbersPositive(params int[] numbersArray)
    {
        foreach ( var number in numbersArray)
        {
            if (number < 0)
            {
                return false;
            }
        }

        return true;
    }

    public bool MoveDirectoriesUp(
        string inputFolderPath,
        int level,
        out string outputFolderPath)
    {
        outputFolderPath = inputFolderPath;

        for (int i = 0; i < level; i++)
        {
            try
            {
                var tmp = Directory.GetParent(outputFolderPath);
                outputFolderPath = tmp.FullName;
            }
            catch
            {
                outputFolderPath = default;
                return false;
            }
        }

        return true;
    }

    public bool FindRange(
        string expression,
        out int move,
        out (int left, int right) range)
    {
        move = default;
        range = default;

        if (string.IsNullOrEmpty(expression))
        {
            return false;
        }

        string regex01 = "^(-?[0-9]\\d*)\\((-?[0-9]\\d*),(-?[0-9]\\d*)\\)$";
        Match match01 = Regex.Match(expression, regex01);
        if (match01.Groups.Count == (3 + 1))
        {
            var success01 = int.TryParse(
                match01.Groups.Values.ElementAt(1).Value,
                out var tmp01);

            var success02 = int.TryParse(
                match01.Groups.Values.ElementAt(2).Value,
                out var tmp02);

            var success03 = int.TryParse(
                match01.Groups.Values.ElementAt(3).Value,
                out var tmp03);

            if (success01 && success02 && success03)
            {
                move = tmp01;
                range.left = tmp02;
                range.right = tmp03;
            }

            return true;
        }

        var regex02 = "^\\((-?[0-9]\\d*),(-?[0-9]\\d*)\\)$";
        var match02 = Regex.Match(expression, regex02);
        if (match02.Groups.Count == (2 + 1))
        {
            var success01 = int.TryParse(
                match02.Groups.Values.ElementAt(1).Value,
                out var tmp01);

            var success02 = int.TryParse(
                match02.Groups.Values.ElementAt(2).Value,
                out var tmp02);

            if (success01 && success02)
            {
                move = 0;
                range.left = tmp01;
                range.right = tmp02;
            }

            return true;
        }

        var regex03 = "^\\((-?[0-9]\\d*)\\)$";
        var match03 = Regex.Match(expression, regex03);
        if (match03.Groups.Count == (1 + 1))
        {
            var success01 = int.TryParse(
                match03.Groups.Values.ElementAt(1).Value,
                out var tmp01);

            if (success01)
            {
                move = 0;
                range.left = tmp01;
                range.right = 0;
            }

            return true;
        }

        return false;
    }

    public string FindFolderInRangeUp(
        string folderName,
        string folderPath,
        int max)
    {
        string startupProjectFolder = default;
        string[] directories = null;
        var currentFolder = folderPath;

        for (var i = 0; i <= max; i++)
        {
            if (currentFolder == null)
            {
                return default;
            }

            directories = Directory.GetDirectories(currentFolder);
            startupProjectFolder = directories.SingleOrDefault(
                x => System.IO.Path.GetFileName(x) == folderName);

            if (startupProjectFolder != default)
            {
                return startupProjectFolder;
            }

            var success = MoveDirectoriesUp(currentFolder, 1, out var outputFolderPath);

            if (!success)
            {
                return default;
            }

            currentFolder = outputFolderPath;
        }

        return default;
    }

    public string FindFolderInRangeDown(
        string folderName,
        string folderPath,
        int max)
    {
        string foundFolder = default;
        string[] directories = null;

        if (max > 0 && !string.IsNullOrEmpty(folderPath))
        {
            directories = Directory.GetDirectories(folderPath);
            foundFolder = directories.SingleOrDefault(
                x => System.IO.Path.GetFileName(x) == folderName);

            if (foundFolder != default)
            {
                return foundFolder;
            }

            foreach (var dir in directories)
            {
                if (!IsSpecial(dir))
                {
                    var found = FindFolderInRangeDown(folderName, dir, max - 1);
                    if (found != null)
                    {
                        return found;
                    }
                }

            }
        }

        return default;
    }

    public bool IsSpecial(string folderPath)
    {
        if (folderPath == "Config.Msi" ||
            folderPath == "$RECYCLE.BIN")
        {
            return true;
        }

        return false;
    }
}
