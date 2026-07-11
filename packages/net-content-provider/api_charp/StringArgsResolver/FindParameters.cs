using System.Reflection;

namespace SharpApiArgsProg;

public class FindParameters
{
    public object[] Try(
        string[] args,
        MethodInfo info)
    {
        var parameters = args.Skip(3).ToArray();
        var gg = GetParameters(parameters, info);
        return gg.ToArray();
    }

    public List<object> GetParameters(
        string[] parameters,
        MethodInfo info)
    {
        var resultParList = new List<object>();
        var infoParList = info.GetParameters();

        int inputIndex = 0;

        for (int methodParamIndex = 0; methodParamIndex < infoParList.Length; methodParamIndex++)
        {
            var infoParameter = infoParList[methodParamIndex];
            var type = infoParameter.ParameterType;

            if (type == typeof(string[]))
            {
                bool isLastMethodParameter = methodParamIndex == infoParList.Length - 1;

                if (!isLastMethodParameter)
                {
                    throw new InvalidOperationException(
                        $"Parameter '{infoParameter.Name}' is string[] but is not the last parameter. " +
                        "A string[] parameter must be the last parameter because it consumes all remaining string arguments."
                    );
                }

                var remainingParameters = parameters
                    .Skip(inputIndex)
                    .ToArray();

                resultParList.Add(remainingParameters);

                inputIndex = parameters.Length;
                break;
            }

            if (inputIndex >= parameters.Length)
            {
                throw new InvalidOperationException(
                    $"Missing argument for parameter '{infoParameter.Name}' of type '{type.Name}' " +
                    $"in method '{info.Name}'."
                );
            }

            var strParameter = parameters[inputIndex];
            var par = ConvertParamFromString(strParameter, type);

            resultParList.Add(par);
            inputIndex++;
        }

        if (inputIndex < parameters.Length)
        {
            var extraArgs = parameters
                .Skip(inputIndex)
                .ToArray();

            throw new InvalidOperationException(
                $"Too many arguments for method '{info.Name}'. Extra args: {string.Join(", ", extraArgs)}"
            );
        }

        return resultParList;
    }
    
    private List<object> GetParameters2(
        string[] parameters,
        MethodInfo info)
    {
        var resultParList = new List<object>();
        var infoParList = info.GetParameters();
        for (int i = 0; i < infoParList.Length; i++)
        {
            var strParameter = parameters[i];
            var infoParameter = infoParList[i];
            
            var type = infoParameter.ParameterType;
            var par = ConvertParamFromString(strParameter, infoParameter.ParameterType);
            resultParList.Add(par);
        }

        return resultParList;
    }

    private object ConvertParamFromString(
        string value,
        Type targetType)
    {
        if (targetType == typeof(string))
            return value;

        if (targetType == typeof(int))
            return int.Parse(value);

        if (targetType == typeof(long))
            return long.Parse(value);

        if (targetType == typeof(ulong))
            return ulong.Parse(value);

        if (targetType == typeof(bool))
            return bool.Parse(value);

        if (targetType == typeof(Guid))
            return Guid.Parse(value);

        if (targetType == typeof(DateTime))
            return DateTime.Parse(value);

        if (targetType.IsEnum)
            return Enum.Parse(targetType, value, ignoreCase: true);

        // Nullable<T>
        if (Nullable.GetUnderlyingType(targetType) is Type underlyingType)
        {
            if (string.IsNullOrEmpty(value))
                return null;

            return ConvertParamFromString(value, underlyingType);
        }

        // Fallback - spróbuj Convert.ChangeType
        return Convert.ChangeType(value, targetType);
    }
}