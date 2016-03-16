/* Storage scenes locally using localStorage or in server if server connection available*/
//Uses DriveModule to access the server

var SceneStorageModule = {
	name: "scene_storage",
	localscene_prefix: "wgl_localscenes_",
	
	preferences: {
		show_guest_warning: true
	},

	init: function()
	{
		var menubar = LiteGUI.menubar;
		
		menubar.add("Project/New", {callback: this.onNewScene.bind(this) });

		menubar.add("Project/Load/From Server", { callback: this.showLoadSceneFromServerDialog.bind(this) });
		menubar.add("Project/Load/Local", { callback: this.showLoadLocalSceneDialog.bind(this) });
		menubar.add("Project/Save/In Server", { callback: this.showSaveSceneInServerDialog.bind(this) });
		menubar.add("Project/Save/Local", { callback: this.showSaveSceneInLocalDialog.bind(this) });
		menubar.add("Project/Download", { callback: this.showDownloadSceneDialog.bind(this) });
		menubar.add("Project/Test", { callback: this.testScene.bind(this) });
		menubar.add("Project/Publish", { callback: this.onPublish.bind(this) });
		menubar.add("Project/Export", { callback: this.onExport.bind(this) });

		menubar.separator("Project");
		menubar.add("Project/Reset All", { callback: EditorModule.showResetDialog.bind(EditorModule) });

		menubar.add("Scene/Check JSON", { callback: function() { EditorModule.checkJSON( LS.GlobalScene ); } });

		//feature in development...
		menubar.add("Scene/Create", { callback: function() { SceneStorageModule.showCreateSceneDialog(); } });
		menubar.add("Scene/Select active", { callback: function() { SceneStorageModule.showSelectSceneDialog(); } });
		
		//LiteGUI.mainmenu.separator();

		this.retrieveLocalScenes();
	},

	onNewScene: function()
	{
		LiteGUI.confirm("Are you sure?", function(v) {
			if(!v)
				return;

			LS.ResourcesManager.reset();
			LS.GlobalScene.clear();
			LS.Renderer.reset();
		});
	},

	showLoadSceneFromServerDialog: function()
	{
		if(!LoginModule.session)
		{
			var dialog = LiteGUI.alert("You must be logged in to load scenes, click the <button>Login</button> button.");
			var button = dialog.content.querySelector("button");
			button.addEventListener("click", function(){
				dialog.close();
				LoginModule.showLoginDialog();
			});
			return;
		}

		var selected = "";
		var dialog = LiteGUI.Dialog.getDialog("dialog_load_scene");
		if(dialog)
			return;

		dialog = new LiteGUI.Dialog("dialog_load_scene", {title:"Load Scene", close: true, minimize: true, width: 520, height: 300, scroll: false, draggable: true});
		dialog.show('fade');

		var split = new LiteGUI.Split("load_scene_split",[50,50]);
		dialog.add( split );

		var widgets = new LiteGUI.Inspector();
		var scenes = ["Loading..."];
		var list = widgets.addList(null,scenes, { height: 230, callback: inner_selected});
		widgets.addButtons(null,["Load","Delete"], { className:"big", callback: inner_button });

		split.getSection(0).add( widgets );

		//load scenes
		DriveModule.serverSearchFiles({ category: "SceneTree" }, inner_files );

		function inner_files(items)
		{
			var r = {};
			for(var i in items)
			{
				var item = items[i];
				if(!item.category == "SceneTree")
					continue;
				var name = item.filename.substr(0, item.filename.indexOf("."));
				r[name] = item;
			}
			list.updateItems(r);
		}

		function inner_selected(item)
		{
			selected = item.fullpath;
			split.getSection(1).innerHTML = "";
			var img = new Image();
			img.src = LFS.getPreviewPath( selected );
			split.getSection(1).add(img);
		}

		function inner_button(button)
		{
			if(button == "Load")
			{
				var url = LS.ResourcesManager.path + "/" + selected;
				LS.Renderer.reset();
				LS.GlobalScene.clear();
				LS.GlobalScene.load( url, function(scene, url) {
					scene.extra.folder = LS.ResourcesManager.getFolder( selected );
					scene.extra.fullpath = selected;
				});
				dialog.close();
			}
			if(button == "Delete")
			{
				LiteGUI.confirm("Do you want to delete the file?", function() {
					DriveModule.serverDeleteFile( selected, function(v) { 
						LiteGUI.alert(v?"File deleted":"Error deleting file");
						if(v)
							dialog.close();
					});
				});
			}
		}
	},

	showSaveSceneInServerDialog: function()
	{
		var scene_name = "";
		var scene_folder = "";
		var scene = LS.GlobalScene;

		if(!LoginModule.session)
		{
			var dialog = LiteGUI.alert("You must be logged in to save scenes, click the <button>Login</button> button.");
			var button = dialog.content.querySelector("button");
			button.addEventListener("click", function(){
				dialog.close();
				LoginModule.showLoginDialog();
			});
			return;
		}

		if(LoginModule.session.user.username == "guest" && this.preferences.show_guest_warning )
		{
			LoginModule.showGuestAlert();
			return;
		}

		var dialog = new LiteGUI.Dialog("dialog_save_scene", {title:"Save Scene", close: true, minimize: true, width: 600, height: 300, scroll: false, draggable: true});
		dialog.show('fade');

		var split = new LiteGUI.Split("save_scene_split",[50,50]);
		dialog.add(split);

		if(scene.extra && scene.extra.filename)
			scene_name = scene.extra.filename;

		var pos = scene_name.indexOf(".");
		if(pos != -1) //strip extensions
			scene_name = scene_name.substr(0, pos);

		var widgets = new LiteGUI.Inspector();
		var string_widget = widgets.addString("Filename", scene_name , { callback: function(v) { 
			scene_name = v;
		}});
		var scenes = { id:"Server", children: [] };
		var tree_widget = widgets.addTree("Scenes",scenes, { height: 200, callback: inner_selected});
		widgets.addButton(null,"Save", { className:"big", callback: inner_button });

		split.getSection(0).add( widgets );

		//preview
		var img = new Image();
		img.src = RenderModule.takeScreenshot( DriveModule.texture_thumbnail_size, DriveModule.texture_thumbnail_size);
		split.getSection(1).add( img );

		//load tree
		DriveModule.getServerFoldersTree(inner_tree);

		function inner_tree(tree)
		{
			tree_widget.setValue( tree );
			if(scene.extra.fullpath)
			{
				tree_widget.tree.setSelectedItem( scene.extra.folder , true );
				scene_folder = scene.extra.folder;
			}
		}

		function inner_selected(item)
		{
			scene_folder = item.fullpath;
		}

		function inner_button(button)
		{
			var scene = LS.GlobalScene;

			if(!scene_name)
			{
				LiteGUI.alert("Scene must have a name");
				return;
			}

			if(!scene_folder)
			{
				LiteGUI.alert("You must choose a folder");
				return;
			}

			//remove extension
			var pos = scene_name.indexOf(".");
			if(pos != -1) //strip extensions
				scene_name = scene_name.substr(0, pos);
			//reinsert them
			scene.filename = scene_name + ".scene.json";
			scene.fullpath = scene_folder + "/" + scene.filename;

			if(scene.extra)
			{
				scene.extra.folder = scene_folder;
				scene.extra.filename = scene.filename;
				scene.extra.fullpath = scene.fullpath;
			}

			SceneStorageModule.saveSceneInServer();
			dialog.close();
		}
	},

	showLoadLocalSceneDialog: function()
	{
		var dialog = new LiteGUI.Dialog("dialog_load_scene", {title:"Load Scene", close: true, minimize: true, width: 520, height: 300, scroll: false, draggable: true});
		dialog.show('fade');

		var split = new LiteGUI.Split("load_scene_split",[50,50]);
		dialog.add(split);

		var selected = null;

		var widgets = new LiteGUI.Inspector();
		/*
		widgets.addString("Filename","", { callback_button: function(v) { 
			selected = {name: v};
		}});
		*/
		widgets.addInfo("Local scenes");
		var list = widgets.addList(null,SceneStorageModule.local_scenes, { height: 200, callback: inner_selected});
		widgets.addButtons(null,["Load","Delete"], { className:"big", callback: inner_button });

		$(split.sections[0]).append(widgets.root);

		function inner_selected(value)
		{
			selected = value;
			$(split.sections[1]).empty();
			if(!selected) return;

			var preview = localStorage.getItem(SceneStorageModule.localscene_prefix + "preview_" + value.name);
			if(!preview) return;
			var img = new Image();
			img.src = preview;
			split.sections[1].appendChild(img);
		}

		function inner_button(button)
		{
			if(!selected)
				return;

			if(button == "Load")
			{
				SceneStorageModule.loadLocalScene(selected.name);
				dialog.close();
			}
			else if(button == "Delete")
			{
				SceneStorageModule.removeLocalScene(selected.name);
				list[0].removeItem(selected.name);
				inner_selected(null);
			}
		}
	},

	showSaveSceneInLocalDialog: function()
	{
		var dialog = new LiteGUI.Dialog("dialog_save_scene", {title:"Save Scene", close: true, minimize: true, width: 360, height: 400, scroll: false, draggable: true});
		dialog.show('fade');

		var name = "";
		var scene = LS.GlobalScene;
		if(scene.extra && scene.extra.name)
			name = scene.extra.name;

		var widgets = new LiteGUI.Inspector();
		widgets.addString("Name",name);
		widgets.addInfo("Snapshot", "<div id='snapshot' style='width:256px;height:256px'></div>");
		widgets.addButton("", "Take Snapshot").wclick(inner_preview);
		widgets.addSeparator();
		widgets.addButton(null,"Save", { className: "big", callback: inner_save });

		dialog.add( widgets );

		var preview_info = null;
		inner_preview();

		function inner_save()
		{
			var name = widgets.getValue("Name");
			if(!name) return;

			scene.extra.name = name;
			SceneStorageModule.saveLocalScene(name, {}, scene, preview_info);
			LiteGUI.alert("Scene saved locally");
			dialog.close();
		}

		function inner_preview()
		{
			var img = new Image();
			preview_info = SceneStorageModule.takeScreenshot(256,256);
			img.src = preview_info;
			$("#snapshot img").remove();
			$("#snapshot").append(img);
		}
	},

	showDownloadSceneDialog: function()
	{
		var data = JSON.stringify( LS.GlobalScene.serialize() );
		var dataType = "string";
		var filename = "scene.json";

		window.saveAs || (window.saveAs = window.navigator.msSaveBlob || window.webkitSaveAs || window.mozSaveAs || window.msSaveAs );
		if(window.saveAs)
		{
			var blob = new Blob([data]);
			window.saveAs(blob, "scene.json");
			return;
		}

		var dialog = new LiteGUI.Dialog("dialog_download_scene", {title:"Download Scene", close: true, minimize: true, width: 200, height: 80, scroll: false, draggable: true});
		dialog.show('fade');

		var link = document.createElement("A");
		link.href = "data:application/text," + escape(data);
		link.download = "scene.json";
		link.innerHTML = "<p><h3>Click to download the file</h3></p>";
		link.addEventListener("click", function() { dialog.close(); });

		dialog.add(link);
	},

	showCreateSceneDialog: function()
	{
		var dialog = new LiteGUI.Dialog("dialog_create_scene", {title:"New Scene", close: true, minimize: true, width: 200, scroll: false, draggable: true});

		var widgets = new LiteGUI.Inspector();

		var name = "";

		widgets.addString("Title",name, function(v){ name = v; });

		widgets.addButton(null,"Create", { className:"big", callback: function() { 

			var new_scene = new LS.SceneTree();
			new_scene.extra.title = name;
			CORE.addScene( new_scene );

			dialog.close();
			EditorModule.inspect( null );
			RenderModule.requestFrame();
		}});

		dialog.content.appendChild(widgets.root);

		function inner_selected(value)
		{
			selected_scene = value;
		}

		dialog.add(widgets);
		dialog.show();
		dialog.adjustSize(10);
	},

	showSelectSceneDialog: function()
	{
		var dialog = new LiteGUI.Dialog("dialog_select_scene", {title:"Select Scene", close: true, minimize: true, width: 200, scroll: false, draggable: true});

		var widgets = new LiteGUI.Inspector();

		var scenes = [];
		for(var i in CORE.Scenes)
		{
			var scene = CORE.Scenes[i];
			scenes.push( { name: scene.extra.title || "Unnamed_" + i, scene: scene });
		}

		list_widget = widgets.addList(null, scenes, { height: 140, callback: inner_selected });

		widgets.addButton(null,"Set active", { className:"big", callback: function() { 
			if(!selected_scene)
			{
				dialog.close();
				return;
			}

			if( selected_scene.scene != LS.GlobalScene )
			{
				CORE.selectScene( selected_scene.scene );
			}

			dialog.close();
			EditorModule.inspect( null );
			RenderModule.requestFrame();
		}});

		dialog.content.appendChild(widgets.root);

		function inner_selected(value)
		{
			selected_scene = value;
		}

		dialog.add(widgets);
		dialog.show();
		dialog.adjustSize(10);
	},

	testScene: function()
	{
		SceneStorageModule.saveLocalScene("_test", {}, LS.GlobalScene, SceneStorageModule.takeScreenshot(256,256) );
		var name = SceneStorageModule.localscene_prefix + "_test";
		window.open("player.html?session=" + name,'_blank');
	},

	onPublish: function()
	{
		//check if it has name
		if(!LS.GlobalScene.extra.fullpath)
		{
			LiteGUI.alert("You must save the scene before publishing it.");
			return;
		}

		window.open("player.html?url=" + LS.RM.path + LS.GlobalScene.extra.fullpath,'_blank');
	},

	onExport: function(e)
	{
		LiteGUI.alert("Feature not finished");
	},

	retrieveLocalScenes: function()
	{
		var local_scenes = localStorage.getItem(SceneStorageModule.localscene_prefix + "list");
		if(local_scenes)
		{
			try
			{
				this.local_scenes = JSON.parse(local_scenes);
				return;
			}
			catch (err)
			{
				console.log("Error parsing local scenes list");
			}
		}
		else //no local scene found
		{
			//fill the default scenes cache
			this.resetLocalScenes();
		}
	},

	resetLocalScenes: function()
	{
		var local_scenes = localStorage.removeItem(SceneStorageModule.localscene_prefix + "list");
		this.local_scenes = {};
	},

	loadLocalScene: function( name )
	{
		LS.Renderer.reset();
		LS.GlobalScene.clear();

		if(!this.local_scenes)
			return;

		var scene_info = this.local_scenes[name];
		if(!scene_info)
		{
			trace("Local scene not found: " + name);
			return;
		}
		
		var data = null;
		
		//load local scene
		if(	scene_info.local )
		{
			var local_data = localStorage.getItem( scene_info.local );
			if(!local_data)
				return;

			try
			{
				data = JSON.parse( local_data );
			}
			catch (err)
			{
				console.log("Error: " + err );
				return;
			}
		}
		else if( scene_info.url )
		{
			LS.GlobalScene.load( scene_info.url, inner);
			return;
		}

		if(!data)
			return;
		LS.GlobalScene.configure(data);
		inner(data);

		function inner(data)
		{
			LS.GlobalScene.loadResources();
			LS.GlobalScene.name = name;
			RenderModule.restoreSceneCamera();
		}
	},

	setSceneFromJSON: function( data )
	{
		if(!data)
			return;

		if(data.constructor === String)
		{
			try
			{
				data = JSON.parse( data );
			}
			catch (err)
			{
				console.log("Error: " + err );
				return;
			}
		}

		LS.Renderer.reset();
		LS.GlobalScene.clear();
		LS.GlobalScene.configure(data);
		LS.GlobalScene.loadResources();
		RenderModule.restoreSceneCamera();
	},

	deleteServerScene: function(filename)
	{
	},		

	saveLocalScene: function(name, scene_info, scene, preview)
	{
		scene_info.name = name;

		//save the name
		if(scene) //url scenes dont have a full scene
		{
			scene.name = name;
			//store the scene locally
			scene_info.local = SceneStorageModule.localscene_prefix + name;
			localStorage.setItem( scene_info.local, JSON.stringify( scene.serialize() ) );
		}

		//store the preview (is a base64 image)
		var preview_name = SceneStorageModule.localscene_prefix + "preview_" + name;
		if(preview) 
		{
			scene_info.preview = preview_name;
			localStorage.setItem(preview_name, preview);
		}
		else
			localStorage.removeItem(preview_name);

		//update the local scenes list info
		this.local_scenes[ name ] = scene_info;

		//update local scenes index
		var local_scenes = JSON.stringify( this.local_scenes );
		localStorage.setItem( SceneStorageModule.localscene_prefix + "list", local_scenes);
	},

	removeLocalScene: function(name)
	{
		var info = this.local_scenes[ name ];

		if(info.preview)
			localStorage.removeItem( info.preview );

		if(info.local)
			localStorage.removeItem( info.local );

		delete this.local_scenes[ name ];
		var local_scenes = JSON.stringify( this.local_scenes );
		localStorage.setItem(SceneStorageModule.localscene_prefix + "list", local_scenes);
	},

	saveSceneInServer: function(on_complete, on_error)
	{
		DriveModule.checkResourcesSaved(true, inner_save );

		function inner_save(){
			DriveModule.saveResource( LS.GlobalScene, inner_complete );
		}

		function inner_complete(v,err)
		{
			if(!v)
			{
				LiteGUI.alert("Error: " + err );
				if(on_error)
					on_error(err);
				return;
			}

			if(on_complete)
				on_complete();
		}
	},

	takeScreenshot: function(width, height)
	{
		LS.Renderer.render( LS.GlobalScene, RenderModule.camera, RenderModule.render_settings );

		//slow way of reading the pixels, but it is safe even with preserveDrawingBuffer being false
		var frame = document.createElement("canvas");
		frame.width = gl.canvas.width;
		frame.height = gl.canvas.height;
		var ctx = frame.getContext("2d");
		var imgdata = ctx.getImageData(0, 0, frame.width, frame.height);
		var pixels = new Uint8Array( imgdata.data.length );
		gl.readPixels(0,0,gl.canvas.width,gl.canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
		imgdata.data.set( pixels );
		ctx.putImageData(imgdata, 0, 0);

		var canvas = document.createElement("canvas");
		canvas.width = width;
		canvas.height = height;
		//$("body").append(canvas);

		var s = gl.canvas.height / height;
		var startx = (gl.canvas.width - width*s) * 0.5;
		var starty = (gl.canvas.height - height*s) * 0.5;

		var ctx = canvas.getContext("2d");
		ctx.translate(0,canvas.height);
		ctx.scale(1,-1);
		ctx.drawImage( frame, startx, starty, width*s, height*s,0,0, width, height );

		return canvas.toDataURL("image/png");
	},

};

CORE.registerModule( SceneStorageModule );

