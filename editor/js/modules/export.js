var ExportModule = {
	name:"ExportModule",

	//list of files to be included when exporting the player
	player_files: [
		"player.html",
		"js/extra/gl-matrix-min.js",
		"js/extra/litegl.js",
		"js/extra/litegraph.js",
		"js/extra/Canvas2DtoWebGL.js",
		"js/extra/litescene.js"
	],

	//allows to create new exporters easily for propietary formats
	exporters: {},

	libraries: {},
	engine_lib: null,
	trim_comments: true,
	includes: {
		litegraph: true,
		canvas2D: true,
	},

	init: function()
	{
		LiteGUI.menubar.add("Project/Export", { callback: function() {
			ExportModule.showDialog();
		}});

		LiteGUI.requireScript("js/extra/jszip.min.js");
	},

	registerExporter: function( exporter )
	{
		if(!exporter.name)
			throw("Exporter name missing");
		this.exporters[ exporter.name ] = exporter;
	},

	showDialog: function()
	{
		var that = this;
		var dialog = new LiteGUI.Dialog( { title: "Export", close: true, width: 900, height: 420, scroll: false, draggable: true } );

		var area = new LiteGUI.Area({width:"100%",height:"100%"});
		area.split("horizontal",["60%",null]);
		dialog.add(area);

		var inspector_left = new LiteGUI.Inspector( { scroll: true, resizable: true, full: true } );
		area.getSection(0).add( inspector_left );

		var inspector_right = new LiteGUI.Inspector( { scroll: true, name_width: 150, resizable: true, full: true } );
		area.getSection(1).add( inspector_right );

		//FILE SELECTION
		var unselected_as_links = true;
		var resources_list = null;

		inspector_left.on_refresh = function()
		{
			inspector_left.addTitle("Exported Files");
			var resources = LS.GlobalScene.getResources( {}, true, true, true );
			resources_list = inspector_left.addList( null, resources, { multiselection: true, height: 300 });
			for(var j = 0; j < resources.length; ++j)
				resources_list.selectIndex(j,true);
			inspector_left.addResource("Add Resource","",{ name_width: 200, callback: function(v){ 
				this.setValue("",true);
				var res = resources_list.getSelected();
				if(res.indexOf(v) != -1)
					return;
				resources_list.addItem( v, true );
			}});
			inspector_left.addCheckbox("Set unselected as links",unselected_as_links,{ name_width: 200, callback: function(v){ unselected_as_links = v; }} );
			inspector_left.addButtons("Select",["All","None","Scripts"], function(v){
				if(v == "All")
				{
					for(var j = 0; j < resources.length; ++j)
						resources_list.selectIndex(j,true);
				}
				else if(v == "None")
				{
					for(var j = 0; j < resources.length; ++j)
						resources_list.deselectIndex(j);
				}
				else if(v == "Scripts")
				{
					resources_list.selectByFilter(function(v,item,selected){
						if( LS.RM.getExtension( item.dataset["name"] ) == "js" )
							return true;
					});
				}
			});
		}

		//EXPORT MODES
		var modes = [];
		for(var i in this.exporters)
			modes.push(i);
		var mode = modes[0];
		var exporter = this.exporters[ mode ];

		inspector_right.on_refresh = function()
		{
			var inspector = inspector_right;
			inspector.clear();

			inspector.addCombo("Export mode", mode, { values: modes, callback: function(v){
				mode = v;
				exporter = that.exporters[ mode ];
				inspector.refresh();
			}});
			inspector.addSeparator();
			inspector.startContainer("",{ height: 320 });
			if(exporter.inspect)
				exporter.inspect( inspector );
			inspector.endContainer();
			inspector.addSeparator();
			inspector.addButton(null,"Export",{ callback: function(){

				if(exporter.export)
				{
					dialog.close();
					var alert = LiteGUI.alert("Exporting...");
					var info = {};
					info.resources = resources_list.getSelected();
					setTimeout( function(){ 
						exporter.export( info, function(){
							alert.close();
						});
					},1);
				}
			}});
		}

		inspector_left.refresh();
		inspector_right.refresh();
		dialog.show();
	},

	showOptimizeLibrariesDialog: function()
	{
		var that = this;
		var dialog = new LiteGUI.Dialog( { title: "Optimize Libraries", close: true, width: 800, height: 400, scroll: false, draggable: true } );

		var area = new LiteGUI.Area({width:"100%",height:"100%"});
		area.split("horizontal",["60%",null]);
		dialog.add(area);

		var inspector_left = new LiteGUI.Inspector( { scroll: true, resizable: true, full: true } );
		area.getSection(0).add( inspector_left );

		var inspector_right = new LiteGUI.Inspector( { scroll: true, name_width: 250, resizable: true, full: true } );
		area.getSection(1).add( inspector_right );

		dialog.show();

		var total_size = 0;
		var total_size_widget = null;
		var include_parsers = true;
		var include_graphs = true;
		var include_scripts = true;
		var include_uncommon = true;
		var include_animations = true;
		var include_pack = true;

		function inner_refresh()
		{
			inspector_left.clear();
			inspector_right.clear();
			var parts = ExportModule.engine_lib.parts;

			var container = inspector_left.startContainer();
			container.style.height = "350px";
			container.style.overflow = "auto";
			total_size = 0;

			inspector_left.widgets_per_row = 2;
			for(var i in parts)
			{
				var part = parts[i];
				if( part.base )
					inspector_left.addInfo(part.name,"", { name_width: 300, width: "80%" } );
				else
					inspector_left.addCheckbox( part.name, part.selected, { name_width: 300, width: "80%", part: part, callback: function(v){ this.options.part.selected = v; total_size += this.options.part.size * (v ? 1 : -1); total_size_widget.setValue((total_size/1024).toFixed() + " KBs");} });	
				inspector_left.addString(null,  ""+(part.size / 1024 ).toFixed() + " KBs", { width: "20%" } );
				if( part.selected )
					total_size += part.size;
			}
			inspector_left.widgets_per_row = 1;

			inspector_left.endContainer();
			inspector_left.addButtons(null,["Add All","None","Guess"], { callback: function(v){
				if(v == "Add All")
					ExportModule.engine_lib.parts.forEach(function(v){ v.selected = true; });
				else if(v == "None")
					ExportModule.engine_lib.parts.forEach(function(v){ if(!v.base) v.selected = false; });
				inner_refresh();
			}});

			total_size_widget = inspector_right.addString("Total Size", (total_size/1024).toFixed() + " KBs" );
			inspector_right.addSeparator();
			inspector_right.addCheckbox("Include parsers", include_parsers, { callback: function(v){ include_parsers = v; inner_toggle_tag("parser",v); }});
			inspector_right.addCheckbox("Include scripts", include_scripts, { callback: function(v){ include_scripts = v; inner_toggle_tag("scripts",v); }});
			inspector_right.addCheckbox("Include graphs", include_graphs, { callback: function(v){ include_graphs = v; inner_toggle_tag("graphs",v); }});
			inspector_right.addCheckbox("Include animation", include_animations, { callback: function(v){ include_animations = v; inner_toggle_tag("animation",v); }});
			inspector_right.addCheckbox("Include not common", include_uncommon, { callback: function(v){ include_uncommon = v; inner_toggle_tag("uncommon",v); }});
			inspector_right.addCheckbox("Include prefab & pack", include_pack, { callback: function(v){ include_pack = v; inner_toggle_tag("pack",v); }});
			inspector_right.addSeparator();
			inspector_right.addCheckbox("Include LiteGraph", ExportModule.includes.litegraph, { callback: function(v){ ExportModule.includes.litegraph = v; }});
			inspector_right.addCheckbox("Include Canvas2DtoWebGL", ExportModule.includes.canvas2D, { callback: function(v){ ExportModule.includes.canvas2D = v; }});
			inspector_right.addSeparator();
			inspector_right.addCheckbox("Trim code comments", ExportModule.trim_comments, { callback: function(v){ ExportModule.trim_comments = v; }});
			inspector_right.addButton(null, "Download Optimized Code", function(){
				var code = ExportModule.generateEngineFile();
				var blob = new Blob( [code], {type : "application/text"} );
				ExportModule.engine_lib.optimized_file = blob;
				var url = URL.createObjectURL(blob);
				window.open( url, "_blank" );
				LiteGUI.downloadFile("litescene.js",blob);
			});
			inspector_right.addSeparator();
			inspector_right.addButton(null, "Save", function(){
				var code = ExportModule.generateEngineFile();
				var blob = new Blob( [code], {type : "application/text"} );
				ExportModule.engine_lib.optimized_file = blob;
				dialog.close();
			});
		}

		function inner_toggle_tag( tag, value )
		{
			var parts = ExportModule.engine_lib.parts;
			for(var i in parts)
			{
				var part = parts[i];
				if(!part[tag])
					continue;
				part.selected = value;
			}
			inner_refresh();
		}

		if(ExportModule.engine_lib)
		{
			inner_refresh();
			return;
		}

		inspector_left.addInfo(null,"Loading engine...");

		LS.Network.requestText( "js/extra/litescene.js", function(data){
			var info = {
				data: data,
				parts: null
			};

			console.log(" + processing engine...");
			var parts = [];
			var lines = data.split("\n");
			var l = lines.length;
			var current_part = null;

			for(var i = 0; i < l; ++i)
			{
				var line = lines[i];
				var trimmed = line.trim();
				if(trimmed.substr(0,4) != "///@")
				{
					if(current_part)
						current_part.lines.push(line);
					continue;
				}

				var t = trimmed.substr(4).split(":");
				var code = t[0].trim();

				if(code == "FILE")
				{
					if(current_part) //compact
					{
						current_part.code = current_part.lines.join("\n");
						current_part.lines = null;
						current_part.size = current_part.code.length;
					}

					current_part = {
						name: trimmed.substr(9),
						lines: [],
						selected: true
					};
					if(current_part.name == "../src/parsers/collada.js") //HACK
						current_part.parser = true;
					parts.push( current_part );
				}
				else if(code == "INFO")
				{
					if(current_part)
					{
						var tags = t[1].split(",").map(function(v){ return v.trim(); });
						for(var j in tags)
							current_part[ tags[j].toLowerCase() ] = true;
						current_part.tags = tags;
					}
				}
			}

			current_part.code = current_part.lines.join("\n");
			current_part.lines = null;
			current_part.size = current_part.code.length;

			info.parts = parts;
			ExportModule.engine_lib = info;
			inner_refresh();
		});
	},

	generateEngineFile: function()
	{
		if(!ExportModule.engine_lib)
			throw("cannot generate without lib");

		var code = "";
		var parts = ExportModule.engine_lib.parts;
		for(var i = 0; i < parts.length; ++i)
		{
			var part = parts[i];
			if(!part.selected || !part.code)
				continue;
			code += part.code;
		}

		if( this.trim_comments )
			return LScript.cleanCode(code);
		return code;
	},

	exportToOBJ: function( to_memory, group_materials )
	{
		var final_vertices = [];
		var final_normals = [];
		var final_uvs = [];
		//meshes are deindexed to prevent problems

		var groups = [];
		var offset = 0;
		var length = 0;
		var instances = LS.Renderer._visible_instances.concat();

		//group by material
		group_materials = true;
		if(group_materials)
			instances.sort(function(a,b){ if( a.material.uid < b.material.uid ) return -1; if( a.material.uid > b.material.uid ) return 1; return 0; });

		var last_group = null;
		var last_material = null;

		for(var i = 0; i < instances.length; i++)
		{
			var ri = instances[i];
			var mesh = ri.mesh;

			var indices_buffer = ri.index_buffer;

			var vertices_buffer = ri.vertex_buffers.vertices;
			var normals_buffer = ri.vertex_buffers.normals;
			var coords_buffer = ri.vertex_buffers.coords;

			var vertices = vertices_buffer.data;
			var normals = normals_buffer ? normals_buffer.data : null;
			var uvs = coords_buffer ? coords_buffer.data : null;

			var v2 = vec3.create();
			var is_new_group = !last_material || !group_materials || ri.material != last_material;
			last_material = ri.material;

			if(indices_buffer)
			{
				var indices_data = indices_buffer.data;
				length = indices_data.length;
				for(var j = 0; j < indices_data.length; ++j)
				{
					var index = indices_data[j];
					var v = vertices.subarray( index*3, index*3 + 3 );
					vec3.transformMat4( v2, v, ri.matrix );
					final_vertices.push(v2[0],v2[1],v2[2]);

					if(normals)
					{
						var v = normals.subarray( index*3, index*3 + 3 );
						mat4.rotateVec3( v2, ri.normal_matrix, v );
						final_normals.push(v2[0],v2[1],v2[2]);
					}

					if(uvs)
					{
						var uv = uvs.subarray( index*2, index*2 + 2 );
						final_uvs.push( uv[0], uv[1] );
					}
				}
			}
			else
			{
				length = vertices.length/3;
				for(var j = 0; j < length; ++j)
				{
					var index = j;
					var v = vertices.subarray( index*3, index*3 + 3 );
					vec3.transformMat4( v2, v, ri.matrix );
					final_vertices.push(v2[0],v2[1],v2[2]);

					if(normals)
					{
						var v = normals.subarray( index*3, index*3 + 3 );
						mat4.rotateVec3( v2, ri.normal_matrix, v );
						final_normals.push(v2[0],v2[1],v2[2]);
					}

					if(uvs)
					{
						var uv = uvs.subarray( index*2, index*2 + 2 );
						final_uvs.push( uv[0], v[1] );
					}
				}
			}

			var material = ri.material;
			var material_name = LS.RM.getBasename( ri.material.filename );
			if(!material_name && ri.material.textures.color && ri.material.textures.color.texture)
				material_name = LS.RM.getFilename( ri.material.textures.color.texture );

			//groups
			if(is_new_group)
			{
				var group = last_group = {
					name: "mesh_" + i,
					start: offset,
					length: length,
					material: material_name
				};
				groups.push( group );
			}
			else
				last_group.length += length;

			offset += length;
		}

		var extra = { info: { groups: groups } };

		var final_mesh = new GL.Mesh( { vertices: final_vertices, normals: final_normals, coords: final_uvs }, null, extra );
		window.LAST_EXPORTED_MESH = final_mesh;
		LS.RM.registerResource( "export.obj", final_mesh );
		var data = final_mesh.encode("obj");

		if(!to_memory)
			LiteGUI.downloadFile("export.OBJ", data );
		else
			LS.RM.processResource("export.obj", data );
	},

	exportToZIP: function( resources, include_player, settings, on_complete )
	{
		if(!window.JSZip)
		{
			LiteGUI.alert("JSZIP.js not found.");
			if(on_complete)
				on_complete(null);
			return;
		}

		settings = settings || {};

		//get all resource and its names
		var resource_names = null;
		if(resources)
			resource_names = resources;
		else
		{
			var resources = LS.GlobalScene.getResources( null, true, true, true );
			for(var i in resources)
				resource_names.push(i);
		}

		var zip = new JSZip();

		//rename resources in case we need it
		var renamed_resources = {};
		if( settings.strip_unitnames )
		{
			var new_resource_names = [];
			for(var i in resource_names)
			{
				var old_name = resource_names[i];
				var folder = LS.RM.getFolder( old_name );
				var filename = LS.RM.getFilename( old_name );
				var ext = LS.RM.getExtension( old_name );
				var ext2 = LS.RM.getExtension( old_name, true );

				folder = "other";
				var res = LS.RM.getResource( old_name );
				if(res)
				{
					if(res.constructor == GL.Texture)
						folder = "textures";
					else if(res.constructor == GL.Mesh)
						folder = "meshes";
					else if(res.constructor == LS.Animation )
						folder = "animations";
					else if(res.constructor.is_material)
						folder = "materials";
					else if(res.constructor == LS.Prefab)
						folder = "prefabs";
				}
				else
				{
					if(ext == "js")
						folder = "scripts";
					else if(ext == "json")
					{
						if(ext2 == "MAT")
							folder = "materials";
					}
				}

				/*
				var t = LS.RM.cleanFullpath( folder ).split("/");
				t.shift(); //remove unit name
				folder = t.join("/");
				*/

				var new_name = "data/" + folder + "/" + filename;
				renamed_resources[ new_name ] = old_name;
				LS.RM.renameResource( old_name, new_name );
				new_resource_names.push( new_name );
			}
			resource_names = new_resource_names;
		}

		//scene info
		var scene_json = LS.GlobalScene.serialize();
		zip.file("scene.json", JSON.stringify( scene_json ) );

		//resources
		var res_data = LS.RM.getResourcesData( resource_names );
		for(var filename in res_data)
		{
			zip.file( filename, res_data[ filename ] );
		}

		//restore stuff: this is done in case we messed up some global resource filename (like textures in shared materials)
		if( settings.strip_unitnames )
		{
			for(var i in resource_names)
			{
				var new_name = resource_names[i];
				var old_name = renamed_resources[new_name];
				if(!old_name)
				{
					console.warn("Resource renamed cannot find previous name: " + new_name);
					continue;
				}
				LS.RM.renameResource( new_name, old_name ); //back to normal
				var res = LS.RM.getResource( old_name );
				if(res)
					res._modified = false; //to leave it as it was (assuming it wasnt modified)
			}
		}

		var filename = "scene.zip";

		if( include_player )
		{
			var extra_settings = {};
			if( settings.alpha_canvas )
				extra_settings.alpha = settings.alpha_canvas;
			if( settings.ignore_scroll )
				extra_settings.ignore_scroll = settings.ignore_scroll;
			if( settings.ignore_touch )
				extra_settings.ignore_touch = settings.ignore_touch;

			this.loadPlayerFiles( zip, inner_ready, settings.use_optimized_engine && ExportModule.engine_lib, extra_settings );
		}
		else
			inner_ready();

		function inner_ready()
		{
			//create ZIP file
			zip.generateAsync({type:"blob"}).then(function(content) {
				LiteGUI.downloadFile( filename, content );
				if( on_complete )
					on_complete();
			});
		}
	},

	exportToWBIN: function( resources )
	{
		var pack = LS.GlobalScene.toPack( "scene", resources );
		if(pack)
			LiteGUI.downloadFile( "scene.PACK.wbin", pack.bindata );
	},

	loadPlayerFiles: function( zip, on_complete, use_optimized_engine, extra_settings )
	{
		//it could be nice to add a dialog to config the player options here
		var player_options = { 
			resources: "./",
			scene_url: "scene.json"
		};
		zip.file( "config.json", JSON.stringify( player_options ) );

		var files = this.player_files.concat();
		var filename = files.pop();
		LS.Network.requestText( filename, inner );

		function inner( file )
		{
			//change player to index
			if(filename == "player.html")
			{
				filename = "index.html";
				if( extra_settings )
				{
					var extra_code = "";
					for(var i in extra_settings)
						extra_code += "\tsettings." + i + " = " + extra_settings[i] + ";\n";
					file = file.replace( "/*SETTINGS_SETUP*/",extra_code);
				}
			}
			
			if( use_optimized_engine )
			{
				if(filename == "js/extra/litegraph.js" && !ExportModule.includes.litegraph )
					file = null;
				if(filename == "js/extra/Canvas2DtoWebGL.js" && !ExportModule.includes.canvas2D )
					file = null;

				if(filename == "js/extra/litescene.js")
					file = ExportModule.engine_lib.optimized_file;
			}

			//add to zip
			if(file)
				zip.file( filename, file );

			if(!files.length)
				on_complete();

			//seek another file
			filename = files.pop();
			LS.Network.requestText( filename, inner );
		}
	}
}


ExportModule.registerExporter({
	name:"zip",
	settings: {
		player: true,
		strip_unitnames: false,
		alpha_canvas: false,
		ignore_scroll: false,
		ignore_touch: false
	},
	inspect: function(inspector)
	{
		var that = this;
		inspector.addCheckbox("Include player", this.settings.player, function(v){ that.settings.player = v; });
		inspector.widgets_per_row = 2;
		inspector.addCheckbox("Use optimized", this.settings.use_optimized, function(v){ that.settings.use_optimized = v; });
		inspector.addButton( null, "Optimize Engine Size", ExportModule.showOptimizeLibrariesDialog.bind(ExportModule) );
		inspector.widgets_per_row = 1;
		inspector.addCheckbox("Strip unit names", this.settings.strip_unitnames, function(v){ that.settings.strip_unitnames = v; });
		inspector.addCheckbox("Ignore scroll", this.settings.ignore_scroll, function(v){ that.settings.ignore_scroll = v; });
		inspector.addCheckbox("Ignore touch", this.settings.ignore_touch, function(v){ that.settings.ignore_touch = v; });
		inspector.addCheckbox("Alpha canvas", this.settings.alpha_canvas, function(v){ that.settings.alpha_canvas = v; });
	},
	export: function( info, on_complete )
	{
		ExportModule.exportToZIP( info.resources, this.settings.player, this.settings, on_complete );
	}
});

ExportModule.registerExporter({
	name:"wbin",
	settings: {
		player: true
	},
	inspect: function(inspector)
	{
		var that = this;
	},
	export: function( info, on_complete )
	{
		ExportModule.exportToWBIN( info.resources );
		if(on_complete)
			on_complete();
	}
});


ExportModule.registerExporter({
	name:"obj",
	settings: {
		to_memory: false
	},
	inspect: function(inspector)
	{
		var that = this;
		inspector.addCheckbox("Export to memory", this.settings.to_memory, function(v){ that.settings.to_memory = v; });
	},
	export: function( info, on_complete )
	{
		ExportModule.exportToOBJ( this.settings.to_memory );
		if(on_complete)
			on_complete();
	}
});

CORE.registerModule( ExportModule );