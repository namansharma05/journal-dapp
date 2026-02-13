export function NewEntryModal() {
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center">
      <div className="w-[60%] md:w-[50%] lg:w-[35%] bg-white p-6 rounded-lg shadow-lg">
        <div className="flex justify-between items-center mb-4">
          <div className="text-sm">New Entry</div>
          <div onClick={() => {}} className="text-sm cursor-pointer">
            x
          </div>
        </div>
        <form>
          <div className="mb-4">
            <label htmlFor="title" className="block text-sm mb-2">
              Title
            </label>
            <input
              type="text"
              id="title"
              className="w-full px-3 py-2 border rounded-md"
            />
          </div>
          <div className="mb-4">
            <label htmlFor="message" className="block text-sm mb-2">
              Message
            </label>
            <textarea
              id="message"
              className="w-full px-3 py-2 border rounded-md"
            />
          </div>
          <div className="flex justify-end">
            <button type="button" className="px-4 py-2 mr-2 text-gray-600">
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-500 text-white rounded-md"
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
