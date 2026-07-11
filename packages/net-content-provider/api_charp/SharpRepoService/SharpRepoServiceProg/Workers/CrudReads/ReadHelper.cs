using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace SharpRepoServiceProg.Workers.CrudReads;

public class ReadHelper
{
    public bool IsSpecialFolder((string, string) adr)
    {
        List<string> special = [".git"];
        if (special.Any(x => x == adr.Item1) ||
            special.Any(x => x == adr.Item2))
        {
            return true;
        }
        
        return false;
    }
    
    public string SelectDirToSection(
        string section,
        string dir)
    {
        // DirToSection
        var newSection = Path.GetFileName(dir);
        if (section != string.Empty)
        {
            newSection = section + '/' + newSection;
        }

        return newSection;
    }
}
