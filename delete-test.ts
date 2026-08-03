import { LocalStore } from './src/stores/localStore';

console.log("Delete logic in app:", `
  const handleDeleteCreature = async (id: string) => {
    await LocalStore.deleteCreature(id);
    if (activeCreature?.id === id) {
      setActiveCreature(null);
      setActiveTab("library");
    }
    await loadLocalDatabase();
  };
`);
