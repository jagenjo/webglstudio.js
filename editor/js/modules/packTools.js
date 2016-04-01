var PackTools = {

	init: function()
	{
		LiteGUI.menubar.add("Node/Create Prefab", { callback: function() { PackTools.showCreatePrefabDialog(); }} );
		LiteGUI.menubar.add("Actions/Create Pack", { callback: function() { PackTools.showCreatePackDialog(); }} );
	},

	showCreatePrefabDialog: function( node )
	{
		node = node || SelectionModule.getSelectedNode();
		if(!node)
		{
			LiteGUI.alert("No node selected");
			return;
		}

		var dialog = new LiteGUI.Dialog("dialog_create_prefab", {title:"Create Prefab", close: true, width: 500, height: 270, scroll: false, draggable: true, resizable: true});
		dialog.show();

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

		var old_name = node.name;
		if(node.prefab)
			old_name = LS.ResourcesManager.getBasename(node.prefab);
		var filename = widgets.addString("Filename", old_name );
		var list = widgets.addList("Include assets", res_names, { multiselection: true, height: 140 });
		widgets.addButtons("Select",["Meshes","Textures","Materials","Animations","All"], { callback: function(v){
			if(v == "All")
				list.selectAll();
			else
			{
				for(var i = 0; i < res_names.length; ++i)
				{
					var res = res_names[i];
					var resource = LS.RM.getResource(res);
					if(!resource)
						continue;
					if( (resource.constructor === GL.Mesh && v == "Meshes") ||
						(resource.constructor === GL.Texture && v == "Textures") ||
						(resource.constructor.is_material && v == "Materials") ||
						(resource.constructor === LS.Animation && v == "Animations") )
						list.selectIndex( i, true );
				}
			}
		}});

		var clear_uids = true;
		widgets.addCheckbox("Clear UIDs", clear_uids, { callback: function(v) { clear_uids = v; }});

		var folder = "";
		widgets.addFolder("Save to",folder,{ callback: function(v){
			folder = v;
		}});

		widgets.addSeparator();
		widgets.addButton(null,"Create Prefab", { callback: function() {
			var filename_str = filename.getValue(); //change spaces by underscores
			var data = node.serialize();
			if(clear_uids)
				LS.clearUIds(data);

			var resources = list.getSelected();

			if( LS.RM.getExtension( filename_str ) != "wbin" )
				filename_str = filename_str + ".wbin";

			var prefab = PackTools.createPrefab( filename_str, data, resources);
			dialog.close();

			NotifyModule.show("Prefab Created","good big");

			if(!folder)
				return;

			var fullpath = LS.RM.cleanFullpath( folder + "/" + prefab.filename );

			LS.RM.renameResource( prefab.filename, fullpath );

			prefab.fullpath = fullpath;
			DriveModule.saveResource( prefab );
		}});

		dialog.add(widgets);
		dialog.adjustSize(5);
	},

	//not called when saving a scene, thats in DriveModule.checkResourcesSaved
	createPrefab: function(filename, data, resources)
	{
		if(!filename)
			return;
		filename = filename.replace(/ /gi,"_");

		//create
		//LS.clearUIds( data ); //remove uids of nodes and components
		var prefab = LS.Prefab.createPrefab( filename, data, resources );

		//register in the system
		LS.ResourcesManager.registerResource( prefab.filename, prefab ); 

		return prefab;
	},

	updatePrefabFromNode: function(node)
	{
		if(!node || !node.prefab)
			return;

		var prefab = LS.RM.resources[ node.prefab ];
		if(!prefab)
			return;

		var clear_uids = true;
		if(prefab.prefab_data && prefab.prefab_data.uid)
			clear_uids = false;

		prefab.updateFromNode( node, clear_uids );
		LS.RM.resourceModified( prefab );
		prefab.applyToNodes( LS.GlobalScene );
	},

	showCreatePackDialog: function( options )
	{
		options = options || {};

		var dialog = new LiteGUI.Dialog("dialog_create_prefab", {title:"Create Pack", close: true, width: 360, height: 270, scroll: false, draggable: true, resizable: true});

		var filename = options.filename || "unnamed_pack";
		var folder = options.folder || "";
		var resources = [];

		var widgets = new LiteGUI.Inspector("prefab_widgets",{ });
		widgets.on_refresh = inner_update;

		function inner_update()
		{
			widgets.clear();

			widgets.addString("Filename",filename, function(v){
				filename = v;
			});

			widgets.addTitle("Resources");
			var container = widgets.startContainer(null,{ height: 200 });
			container.style.backgroundColor = "#252525";

			for(var i = 0; i < resources.length; ++i)
			{
				widgets.addStringButton(null, resources[i], { index: i, callback: function(v){
						if(!v)
							return;
						resources[this.options.index] = v;
					}, callback_button: function(){
						//delete imported
						resources.splice(this.options.index,1);
						widgets.refresh();
					},
					button: "<img src='imgs/mini-icon-trash.png'/>"
				});
			}
			widgets.endContainer();
			widgets.addButtons(null,["Add locals","Add all"],{ callback: function(v){
				for(var i in LS.RM.resources)
				{
					var res = LS.RM.resources[i];
					if(v == "Add locals")
					{
						if(!res.remotepath && resources.indexOf(i) == -1)
							resources.push(i);
					}
					else
						resources.push(i);
				}
				widgets.refresh();
			}});
			widgets.addSeparator();
			widgets.addResource("Add Resource","",{ name_width: 140, callback: function( fullpath ){
				if(resources.indexOf( fullpath ) == -1)
					resources.push( fullpath );
				widgets.refresh();
			}});

			widgets.addFolder("Save to folder", folder, { callback: function(v){ folder = v; } });

			widgets.addButton(null,"Create Pack", function(){
				dialog.close();
				var pack = PackTools.createPack( filename, resources );
				if(folder)
				{
					var fullpath = folder + "/" + filename;
					pack.fullpath = fullpath;
					if( LS.RM.getExtension( pack.fullpath ) != "wbin" )
					{
						pack.filename += ".wbin";
						pack.fullpath += ".wbin";
					}

					DriveModule.saveResource(pack);
				}
				else
					LiteGUI.alert("Pack created");
			});
			dialog.adjustSize(5);
		}

		inner_update();

		dialog.show();
		dialog.add(widgets);
		dialog.adjustSize(5);
	},

	createPack: function( filename, resources )
	{
		if(!filename)
			return;

		filename = filename.replace(/ /gi,"_");
		if( filename.indexOf(".PACK") == -1 )
			filename += ".PACK";

		//create
		var pack = LS.Pack.createPack( filename, resources );

		//register in the system
		LS.ResourcesManager.registerResource( pack.filename, pack ); 

		return pack;
	},

	showPackDialog: function( pack )
	{
		if(!pack)
			return;

		//if(pack.constructor !== LS.Pack)
		//	return console.error("This is not a LS.Pack");

		var class_type = LS.getObjectClassName( pack );

		var dialog = new LiteGUI.Dialog("dialog_show_pack", {title: class_type, close: true, width: 360, height: 270, scroll: false, draggable: true, resizable: true});

		var filename = pack.fullpath || pack.filename;
		var resource_names = pack.resource_names;

		var widgets = new LiteGUI.Inspector( null, {} );
		widgets.on_refresh = inner_update;

		function inner_update()
		{
			widgets.clear();

			widgets.addString("Filename",filename, function(v){
				//filename = v;
			});

			widgets.addTitle("Resources");
			var container = widgets.startContainer(null,{ height: 200 });
			container.style.backgroundColor = "#252525";

			widgets.widgets_per_row = 2;
			for(var i = 0; i < resource_names.length; ++i)
			{
				widgets.addButton(null,"o",{ width: 40, index: i, callback: function(){
					var name = resource_names[this.options.index];
					window.RESOURCE = LS.RM.resources[name];
				}});
				widgets.addStringButton(null, resource_names[i], { index: i, width: "calc(100% - 40px)", callback: function(v){
						if(!v)
							return;
						resource_names[this.options.index] = v;
					}, callback_button: function(){
						//delete imported
						resource_names.splice(this.options.index,1);
						widgets.refresh();
					},
					button: "<img src='imgs/mini-icon-trash.png'/>"
				});
			}
			widgets.widgets_per_row = 1;

			widgets.endContainer();
			widgets.addButtons(null,["Add locals","Add all"],{ callback: function(v){
				for(var i in LS.RM.resources)
				{
					var res = LS.RM.resources[i];
					if(v == "Add locals")
					{
						if(!res.remotepath && resources.indexOf(i) == -1)
							resource_names.push(i);
					}
					else
						resource_names.push(i);
				}
				widgets.refresh();
			}});

			if(class_type == "Prefab")
				widgets.addButton( null, "Show JSON Data", { callback: function(v){
					EditorModule.checkJSON( pack.prefab_data );
				}});

			widgets.addSeparator();
			widgets.addResource("Add Resource","",{ name_width: 140, callback: function( fullpath ){
				if(resource_names.indexOf( fullpath ) == -1)
					resource_names.push( fullpath );
				widgets.refresh();
			}});
			widgets.addButton(null,"Update " + class_type, function(){
				pack.setResources( resource_names, true );
				dialog.close();
				if(pack.fullpath)
					DriveModule.saveResource( pack, function(v){
						LiteGUI.alert( class_type + " updated & saved");
					});
				else
					LiteGUI.alert( class_type + " updated");
			});
			dialog.adjustSize(5);
		}

		inner_update();

		dialog.show();
		dialog.add(widgets);
		dialog.adjustSize(5);
	}
};

CORE.registerModule( PackTools );