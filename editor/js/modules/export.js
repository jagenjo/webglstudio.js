var ExportModule = {

	init: function()
	{
		LiteGUI.menubar.add("Project/Export/to OBJ", { callback: function() { 
			ExportModule.exportToOBJ();
		}});

		LiteGUI.menubar.add("Project/Export/to ZIP", { callback: function() { 
			ExportModule.exportToZIP();
		}});

		LiteGUI.requireScript("js/extra/jszip.min.js");
	},

	exportToOBJ: function()
	{
		var meshes = [];
		for(var i = 0; i < LS.Renderer._visible_instances.length; i++)
		{
			var ri = LS.Renderer._visible_instances[i];
			meshes.push( { mesh: ri.mesh, vertices_matrix: ri.matrix, normals_matrix: ri.normal_matrix } );
		}
		if(!meshes.length)
			return;
		var final_mesh = GL.Mesh.mergeMeshes( meshes );
		LS.RM.registerResource( "export.obj", final_mesh );
		var data = final_mesh.encode("obj");
		LiteGUI.downloadFile("export.OBJ", data );
	},

	exportToZIP: function()
	{
		if(!window.JSZip)
		{
			LiteGUI.alert("JSZIP.js not found.");
			return;
		}

		//get all resource names
		var resources = [];
		var resource_names = LS.GlobalScene.getResources( null, true, true );
		for(var i in resource_names)
		{
			var res = LS.RM.getResource( resource_names[i] );
			if(res)
				resources.push(res);
		}

		var zip = new JSZip();

		//scene info
		zip.file("scene.json", JSON.stringify( LS.GlobalScene.serialize() ) );

		//resources
		var res_data = LS.RM.getResourcesData( resource_names );
		for(var i in res_data)
			zip.file(i, res_data[i]);

		var filename = "scene.zip";

		//create ZIP file
		zip.generateAsync({type:"blob"}).then(function(content) {
			LiteGUI.downloadFile( filename, content );
		});
	}
}

CORE.registerModule( ExportModule );