var PrefabMaker = {

	init: function()
	{
		LiteGUI.menubar.add("Node/Create Prefab", { callback: function() { PrefabMaker.showCreatePrefabDialog(); }} );
	},

	showCreatePrefabDialog: function()
	{
		var node = SelectionModule.getSelectedNode();
		if(!node)
		{
			LiteGUI.alert("No node selected");
			return;
		}

		var dialog = new LiteGUI.Dialog("dialog_create_prefab", {title:"Create Prefab", close: true, width: 360, height: 270, scroll: false, draggable: true});
		dialog.show('fade');

		var widgets = new LiteGUI.Inspector("prefab_widgets",{ });

		var resources = node.getResources({}, true);
		if(node.prefab)
			delete resources[node.prefab];

		//some resources could have also resources (like Materials -> Textures)
		var second_level = {};
		for(var i in resources)
		{
			var resname = i;
			var res = LS.ResourcesManager.resources[resname];
			if(!res) continue;
			if(res.getResources)
				res.getResources(second_level);
		}
		for(var i in second_level)
			resources[i] = second_level[i];

		//get the names
		var res_names = [];
		for(var i in resources)
			res_names.push(i);

		var old_name = "";
		if(node.prefab)
			old_name = LS.ResourcesManager.getBasename(node.prefab);
		var filename = widgets.addString("Filename", old_name );
		var list = widgets.addList("Include assets", res_names, { multiselection: true, height: 140 });
		widgets.addButton(null,"Select all", { callback: function(){
			list.selectAll();
		}});

		widgets.addButton(null,"Create Prefab", { callback: function() {
			var filename_str = filename.getValue(); //change spaces by underscores
			var data = node.serialize();
			var resources = list.getSelected();
			PrefabMaker.createPrefab(filename_str, data, resources);
			dialog.close();
		}});

		dialog.content.appendChild(widgets.root);
	},

	createPrefab: function(filename, data, resources)
	{
		if(!filename) return;
		filename = filename.replace(/ /gi,"_");

		//create
		var prefab = Prefab.createPrefab(filename, data, resources);

		//register in the system
		LS.ResourcesManager.registerResource( prefab.filename, prefab ); 
	}
};

CORE.registerModule( PrefabMaker );