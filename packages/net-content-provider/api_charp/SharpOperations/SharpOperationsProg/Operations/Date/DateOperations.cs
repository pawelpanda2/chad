using System.Text.RegularExpressions;
using SharpOperationsProg.AAPublic.Operations;
using SharpOperationsProg.Operations.Index;

namespace SharpOperationsProg.Operations.Date;


public class DateOperations : IDateOperations
{
    private IIndexOperations _index;
    private static string _pattern = @"^\d{2}-\d{2}-\d{2}$";
    //private string _pattern = @"^\d{2}-(0[0-9]|1[0-2])-(0[0-9]|[12][0-9]|3[01])$";

    public bool TryParse(
        string date,
        out DateTime result)
    {
        result = DateTime.MinValue;
        Regex regex = new(_pattern);
        bool match = regex.IsMatch(date);

        if (!match)
        {
            return false;
        }

        string tmp = "20" + date;
        bool s01 = DateTime
            .TryParse(tmp, out DateTime result2);
        if (s01)
        {
            result = result2;
            return true;
        }
        
        return false;
    }

    public string DateTimeToString(
        DateTime date)
    {
        string separator = "-";
        string year = date.Year.ToString()
            .Substring(2, 2);
        string month = _index.IndexToString(date.Month);
        string day = _index.IndexToString(date.Day);
        
        string result =
            year + 
            separator +
            month +
            separator +
            day;
        return result;
    }

    public DateOperations(
        IIndexOperations index)
    {
        _index = index;
    }

    public string ToYear(string dateString)
    {
        var date = DateTime.Parse(dateString);
        var year = date.Year.ToString();
        return year;
    }

    public string UderscoreDate(DateTime date)
    {
        var year = _index.LastTwoChar(date.Year.ToString());
        var month = _index.IndexToString(date.Month);
        var day = _index.IndexToString(date.Day);
        var hour = _index.IndexToString(date.Hour);
        var minute = _index.IndexToString(date.Minute);

        var dateString = year + "-" + month + "-" + day + "_" + hour + "-" + minute;

        return dateString;
    }
}