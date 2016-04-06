var MeshTools = {
	init: function()
	{
		LiteGUI.menubar.add("Actions/Mesh Tools", { callback: function() { 
			MeshTools.showToolsDialog();
		}});
		LiteGUI.menubar.add("Actions/Export to OBJ", { callback: function() { 
			MeshTools.exportToOBJ();
		}});
	},

	showToolsDialog: function( mesh_name )
	{
		if(this.dialog)
			this.dialog.close();

		var dialog = new LiteGUI.Dialog("dialog_mesh_tools", {title:"Mesh Tools", close: true, minimize: true, width: 300, height: 440, scroll: false, draggable: true});
		dialog.show('fade');
		dialog.setPosition(100,100);
		this.dialog = dialog;

		var widgets = new LiteGUI.Inspector("mesh_tools",{ name_width: "50%" });
		widgets.onchange = function()
		{
			RenderModule.requestFrame();
		}

		inner_update();



		function inner_update()
		{
			var mesh = null;
			if( mesh_name )
				mesh = LS.ResourcesManager.getMesh( mesh_name );

			widgets.clear();

			widgets.addMesh("Mesh", mesh_name || "", { callback: function(v) {
				mesh_name = v;
				inner_update();
			}, callback_load: function( res ){
				mesh_name = res.filename;
				inner_update();
			}});

			if(mesh)
			{
				mesh.inspect( widgets, true );
			}
			else
			{
				if(LS.ResourcesManager.isLoading( mesh ))
					widgets.addInfo(null, "Loading...");
			}

			widgets.addSeparator();
			widgets.addButton("", "Close" , { callback: function (value) { 
				dialog.close(); 
			}});
			dialog.adjustSize();

		}//inner update

		dialog.add( widgets );
		dialog.adjustSize();		
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
	}
};

GL.Mesh.prototype.inspect = function( widgets, skip_default_widgets )
{
	var mesh = this;

	widgets.addTitle("Vertex Buffers");
	for(var i in mesh.vertexBuffers)
	{
		var buffer = mesh.vertexBuffers[i];
		widgets.addInfo(i, (buffer.data.length / buffer.spacing) );
	}
	widgets.addTitle("Indices Buffers");
	for(var i in mesh.indexBuffers)
	{
		var buffer = mesh.indexBuffers[i];
		widgets.addInfo(i, buffer.data.length );
	}

	widgets.addTitle("Actions");
	widgets.addButton(null, "Smooth Normals", function(){
		mesh.computeNormals();
		RenderModule.requestFrame();
	} );
	widgets.addButton(null, "Flip Normals", function(){
		mesh.flipNormals();
		RenderModule.requestFrame();
	} );
	//widgets.addButton(null, "Weld", function(){} );

	if(!skip_default_widgets)
		DriveModule.addResourceInspectorFields( this, widgets );
}

CORE.registerModule( MeshTools );