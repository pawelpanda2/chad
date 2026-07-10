namespace TinderImport
{
    internal class Match2
    {
        public Person2 Person { get; private set; }
        public List<Message> Messages { get; private set; }

        public Match2(Person2 person, List<Message> messages)
        {
            this.Person = person;
            this.Messages = messages;
        }
    }
}
