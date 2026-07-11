public class Message
{
	public string OwnerId { get; private set; }

    public string Text { get; private set; }

    public string OwnerDescription { get; private set; }

    public Message(string text, string ownerId, string ownerDescription)
	{
        Text = text;
        OwnerId = ownerId;
        OwnerDescription = ownerDescription;
    }
}
