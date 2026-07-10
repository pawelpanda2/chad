// namespace SharpContainerProg.Register;
//
// internal partial class AdditionalRegistrationBase
// {
//     public List<Action> ActionList { get; private set; }
//
//     public AdditionalRegistrationBase()
//     {
//         ActionList = new List<Action>();
//         AddMethodsToList();
//     }
//
//     public void Invoke()
//     {
//         foreach (var action in ActionList)
//         {
//             action.Invoke();
//         }
//     }
//
//     public void AddMethodsToList()
//     {
//         //Type type = typeof(PreparerRegistration);
//         //MethodInfo[] methods = type.GetMethods(BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public);
//
//         //foreach (MethodInfo methodInfo in methods)
//         //{
//         //    if (methodInfo.DeclaringType == type &&
//         //        methodInfo.Name.StartsWith("Register"))
//         //    {
//         //        Action methodAction = (Action)Delegate.CreateDelegate(typeof(Action), this, methodInfo);
//         //        ActionList.Add(methodAction);
//         //    }
//         //}
//     }
// }