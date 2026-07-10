using System.Collections;
using System.Runtime.CompilerServices;

namespace SharpOperationsProg.Operations.CollectionAssert;

public class CollectionsAreEqual
{
    private readonly HashSet<Type> ValTupleTypes;

    public CollectionsAreEqual()
    {
        ValTupleTypes = new HashSet<Type>(
            new Type[] { typeof(ValueTuple<>), typeof(ValueTuple<,>),
                typeof(ValueTuple<,,>), typeof(ValueTuple<,,,>),
                typeof(ValueTuple<,,,,>), typeof(ValueTuple<,,,,,>),
                typeof(ValueTuple<,,,,,,>), typeof(ValueTuple<,,,,,,,>)
            }
        );
    }

    public bool Visit(object object1, object object2)
    {
        try
        {
            if (IsGenericList(object1))
            {
                VisitListObject(object1, object2);
            }
        }
        catch
        {
            return false;
        }

        return true;
    }

    private void VisitListObject(object object1, object object2)
    {
        var listObject1 = object1 as IEnumerable;
        var listObject2 = object2 as IEnumerable;
        if (listObject2 == null ||
            listObject2 == null)
        {
            HandleError();
        }

        var enum2 = listObject2.GetEnumerator();
        foreach (var item1 in listObject1)
        {
            enum2.MoveNext();
            var item2 = enum2.Current;

            if (IsValueTuple(item1))
            {
                VisitValueTuple(item1, item2);
            }
        }
    }

    private void VisitObject(object object1, object object2)
    {
        if (object1 is int)
        {
            VistInt(object1, object2);
        }
        if (object1 is string)
        {
            VisitString(object1, object2);
        }
    }

    private void VistInt(object object1, object object2)
    {
        if ((int)object1 != (int)object2)
        {
            HandleError();
        }
    }

    private void VisitString(object object1, object object2)
    {
        if ((string)object1 != (string)object2)
        {
            HandleError();
        }
    }

    private void HandleError()
    {
        throw new Exception();
    }

    private void VisitValueTuple(object object1, object object2)
    {
        var tuples1 = object1 as ITuple;
        var tuples2 = object2 as ITuple;

        var values1 = GetValuesFromTuple(tuples1);
        var values2 = GetValuesFromTuple(tuples2);

        var enum2 = values2.GetEnumerator();
        foreach (var item1 in values1)
        {
            enum2.MoveNext();
            var item2 = enum2.Current;
            VisitObject(item1, item2);
        }
    }

    IEnumerable<object> GetValuesFromTuple(ITuple tuple)
    {
        for (var i = 0; i < tuple.Length; i++)
        {
            yield return tuple[i];
        }
    }

    private bool IsValueTuple(object obj)
    {
        var type = obj.GetType();
        return type.IsGenericType
               && ValTupleTypes.Contains(type.GetGenericTypeDefinition());
    }

    private bool IsGenericList(object o)
    {
        var oType = o.GetType();
        var result = (oType.IsGenericType && (oType.GetGenericTypeDefinition() == typeof(List<>)));
        return result;
    }
}