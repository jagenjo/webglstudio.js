var AddPointsTool = {
	name: "addPoints",
	description: "Add points to component",
	section: "modify",
	icon: "imgs/mini-icon-points_tool.png",

	enabled: false,
	continuous: false, //add while dragging
	mode: "camera_plane", //"colliders","render_instances","camera_plane","XZ","YZ","XY"
	min_distance: 0.1,
	valid_modes: ["colliders","render_instances","camera_plane","XZ","YZ","XY"],
	color: vec4.fromValues(1,1,1,1), //color and alpha
	size: 1,
	offset: 0,

	last_point: null,	
	last_normal: vec3.fromValues(0,1,0),	
	click_pos: vec2.create(),
	raycast_options: { normal: true, triangle_collision: true },

	onEnable: function()
	{
	},

	onClick: function()
	{
		this._component = null;
		this.last_point = null;
	},

	inspect: function( inspector )
	{
		inspector.addCombo("Collision mode", this.mode, { values: this.valid_modes, callback: function(v){
			AddPointsTool.mode = v;
		}});
		inspector.addCheckbox("Continuous", this.continuous, function(v) { AddPointsTool.continuous = v; });
		inspector.widgets_per_row = 2;
		inspector.addNumber("Min. distance", this.min_distance, { min: 0, callback: function(v) { AddPointsTool.min_distance = v; } });
		inspector.addNumber("Offset", this.offset, { callback: function(v) { AddPointsTool.offset = v; } });
		inspector.widgets_per_row = 1;
		inspector.addSeparator();
		inspector.addColor("Color", this.color, function(v) { AddPointsTool.color.set(v); });
		inspector.addSlider("Opacity", this.color[3], function(v) { AddPointsTool.color[3] = v; });
		inspector.addNumber("Size", this.size, function(v) { AddPointsTool.size = v; });
		inspector.addSeparator();

		//show components with addPoints method
		var node = SelectionModule.getSelectedNode();
		if(!node)
			node = LS.GlobalScene.root;
		var components = this.getValidComponents( node );
		var components_data = [];
		var selected = null;
		for(var i = 0; i < components.length; i++)
		{
			var component_info = { title: LS.getObjectClassName(components[i]), component: components[i] };
			if(components[i] == this._component)
				selected = component_info;
			components_data.push(component_info);
		}

		if(components_data.length == 1)
			AddPointsTool.setComponent( components_data[0].component );
		inspector.addCombo("Select Component", selected , { values: components_data, callback: function(v){
			if(v)
				AddPointsTool.setComponent( v.component );
			EditorModule.refreshAttributes();
			return;
		}});


		inspector.addButtons("Add Component",["PointCloud","LineCloud"], function(v){
			var component_class = LS.Components[v];
			if(!component_class)
				return;
			var	component = new component_class();
			var node = SelectionModule.getSelectedNode();
			if(!node)
				node = LS.GlobalScene.root;
			UndoModule.saveNodeChangeUndo( node );
			node.addComponent( component );
			AddPointsTool.setComponent( component );
			EditorModule.refreshAttributes();
			return;
		});
		inspector.addButtons("Actions",["Flatten","Set node flags","Clear"], { name_width: 120, callback:function(v){
			if(!AddPointsTool._component)
				return;
			var component = AddPointsTool._component;
			CORE.userAction("component_changed", component );

			if(v == "Clear")
			{
				component.reset();
			}
			else if(v == "Flatten")
			{
				var points = component.points;
				if(points)
				{
					for(var i = 0; i < points.length; ++i)
					{
						var p = points[i];
						if(p.length > 2)
							p[1] = 0;
					}
					component._must_update = true;
				}
			}
			else //set node flags
			{
				component._root.flags.depth_write = false;
			}

			EditorModule.refreshAttributes();
		}});
		inspector.addSeparator();

		if(SelectionModule.selection && SelectionModule.selection.instance && SelectionModule.selection.instance.getPointRef)
		{
			var ref = SelectionModule.selection.instance.getPointRef( SelectionModule.selection.info );
			if(ref)
			{
				inspector.widgets_per_row = 2;
				inspector.addVector3("Selected", ref , { width: "calc( 100 % - 40px )", callback: function(v){ ref[0] = v[0]; ref[1] = v[1]; ref[2] = v[2]; }});
				inspector.addButton(null, TRASH_ICON_CODE, { width: "40px", callback: function(){
					CORE.userAction("component_changed", SelectionModule.selection.instance );
					SelectionModule.selection.instance.removePoint( SelectionModule.selection.info );
					SelectionModule.selection = null;
				}});
				inspector.widgets_per_row = 1;
			}
		}

		inspector.addSeparator();
		if( this._component )
			inspector.showComponent( this._component );
	},

	mousedown: function(e) {
		this.click_pos[0] = e.canvasx;
		this.click_pos[1] = e.canvasy;

		if(!this._component)
		{
			var node = SelectionModule.getSelectedNode();
			if(!node)
				node = LS.GlobalScene.root;
			var components = this.getValidComponents( node );
			this.setComponent( components[0] );

			if(!this._component)
			{
				LiteGUI.alert("No component found in node " + node.name + " that has addPoints support. Add PointsCloud Component.");
				return;
			}
		}

		if(e.which == GL.LEFT_MOUSE_BUTTON && !e.ctrlKey && !this.continuous) //continuos is add while dragging, like painting
		{
			//test first closer point
			var index = this.findNearestPointIndex(this.click_pos, 20);
			if(index != -1)
			{
				console.log("selected point");
				SelectionModule.setSelection({ instance: this._component, info: index, node: this._component._root });
				return true;
			}

			//if no point, then add
			if(this._component)
				CORE.userAction("component_changed", this._component );
			var point = this.computePoint(e);
			if(point)
				this.addPoint( point );
			return true;
		}
	},

	mousemove: function(e) {

		if(!this._component)
			return;

		if(!this._component._root || !this._component._root.scene)
		{
			this._component = null;
			return;
		}

		if(e.ctrlKey)
			return;
		
		//test
		if(e.dragging && e.which == GL.LEFT_MOUSE_BUTTON && this.continuous)
		{
			var point = this.computePoint(e);
			if(point)
				this.addPoint( point );
		}
		return true;
	},

	mouseup: function(e) {
	},

	setComponent: function( component )
	{
		if(this._component != component )
			this.last_point = null;
		this._component = component;
	},

	getValidComponents: function( node )
	{
		var valid = [];
		var components = node.getComponents();
		for(var i = 0; i < components.length; i++)
		{
			var component = components[i];	
			if( !component.addPoint )
				continue;
			valid.push( component );
		}
		return valid;
	},

	findNearestPointIndex: function(pos, max_dist)
	{
		if(max_dist === undefined)
			max_dist = 100000;
		var comp = this._component;
		if(!comp)
			return -1;
		var points = comp.points;
		var model = mat4.create();
		comp._root.transform.getGlobalMatrix(model);
		var camera = RenderModule.getActiveCamera();
		var points = comp.points;
		if(!points)
			return -1;
		var min_dist = 100000;
		var nearest = -1;
		var result = vec3.create();
		for(var i = 0; i < points.length; ++i)
		{
			var point = points[i];
			vec3.transformMat4( result, point, model );
			camera.project(result,null,result);
			//TODO; discard behind
			var dist = vec2.distance(pos, result);
			if( dist > min_dist || dist > max_dist )
				continue;
			min_dist = dist;
			nearest = i;
		}

		return nearest;
	},

	addPoint: function( point )
	{
		if(!point || !this._component)
			return;

		//apply offset
		if(this.offset)
			vec3.scaleAndAdd( point, point, this.last_normal, this.offset );			

		if( this._component.in_world_coordinates )
		{
			//convert to local coordinates
			var node = this._component._root;
			var transform = node.transform;
			if(transform)
			{
				var matrix = transform.getGlobalMatrix();
				mat4.invert( matrix, matrix );
				vec3.transformMat4( point, point, matrix );
			}
		}

		if(this.min_distance && this.last_point && vec3.distance( this.last_point, point ) < this.min_distance )
			return;

		this.last_point = point;

		this._component.addPoint( point, this.color, this.size );

		if(this._component.max_points && this._component.num_points && this._component.max_points < this._component.num_points)
			this._component.max_points *= 2;

		EditorModule.updateInspector();
		LS.GlobalScene.refresh();
	},

	computePoint: function(e)
	{
		var camera = ToolUtils.getCamera();
		var ray = camera.getRayInPixel( e.canvasx, e.canvasy );

		if(this.mode == "colliders")
		{
			var collisions = LS.Physics.raycast( ray.origin, ray.direction, this.raycast_options ); 
			this.last_collisions = collisions;
			if(collisions.length)
			{
				if( collisions[0].normal )
					this.last_normal.set( collisions[0].normal );
				else
					this.last_normal.set([0,0,0]);
				return collisions[0].position;
			}
			return null;
		}
		
		if(this.mode == "render_instances")
		{
			var collisions = LS.Physics.raycastRenderInstances( ray.origin, ray.direction, this.raycast_options ); 
			this.last_collisions = collisions;
			if(collisions.length)
			{
				if( collisions[0].normal )
					this.last_normal.set( collisions[0].normal );
				else
					this.last_normal.set([0,0,0]);
				return collisions[0].position;
			}
			return null;
		}

		var plane_center = null;
		var plane_normal = null;

		if(this.mode == "camera_plane")
		{
			plane_center = camera.getCenter();
			plane_normal = camera.getFront();
			vec3.scale( plane_normal, plane_normal, -1 );
		}
		else if(this.mode == "XZ")
		{
			plane_center = [0,0,0];
			plane_normal = [0,1,0];
		}
		else if(this.mode == "XY")
		{
			plane_center = [0,0,0];
			plane_normal = [0,0,1];
		}
		else if(this.mode == "YZ")
		{
			plane_center = [0,0,0];
			plane_normal = [1,0,0];
		}
		else
			return null;

		this.last_normal.set( plane_normal );

		var result = vec3.create();
		if( geo.testRayPlane( ray.origin, ray.direction, plane_center, plane_normal, result ) )
			return result;
		return null;
	},

	renderEditor: function()
	{
	}
};

ToolsModule.registerTool( AddPointsTool );