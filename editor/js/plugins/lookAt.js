/**
* LookAt rotate a mesh to look at the camera or another object
* @class LookAt
* @constructor
* @param {Object} object to configure from
*/



function LookAt(o)
{
	this.enabled = true;
	this.node_id = null;
	this.front = LookAt.POSZ;
	this.up = LookAt.POSY;
	
	

	this.createProperty( "initial_rotation", vec3.fromValues(0,0,0)); // isn't this the same as this.initial_rotation = vec3.fromValues?
	
	this.lock_to_axis= LookAt.NONE;
	
	this.lim_horizontal = false;
	this.limit_horizontal = vec2.create(); // Min,Max
	this.lim_vertical = false;
	this.limit_vertical = vec2.create(); // Min,Max
	
	this.influence = 1;


	this._target_position = vec3.create();
	this._quat = vec4.create();
	this._vec = vec3.create();


	if(o)
		this.configure(o);
}

LookAt.icon = "mini-icon-lookAt.png";

LookAt.POSX = 1;
LookAt.NEGX = 2;
LookAt.POSY = 3;
LookAt.NEGY = 4;
LookAt.POSZ = 5;
LookAt.NEGZ = 6;

LookAt.NONE = 1;
LookAt.HORIZONTAL = 2;
LookAt.VERTICAL = 3;

LookAt["@node_id"] = { type: 'node' };
LookAt["@front"] = { type: 'enum', values: { "-Z": LookAt.NEGZ,"+Z": LookAt.POSZ, "-Y": LookAt.NEGY,"+Y": LookAt.POSY,"-X": LookAt.NEGX,"+X": LookAt.POSX }};
LookAt["@up"] = { type: 'enum', values: { "-Z": LookAt.NEGZ,"+Z": LookAt.POSZ, "-Y": LookAt.NEGY,"+Y": LookAt.POSY,"-X": LookAt.NEGX,"+X": LookAt.POSX }};
LookAt['@influence'] = {type:"slider", min:0, max: 1};
LookAt["@lock_to_axis"] = { type: "enum", values: {"Off": LookAt.NONE, "Horizontal": LookAt.HORIZONTAL, "Vertical": LookAt.VERTICAL }};


LookAt.prototype.onAddedToNode = function(node)
{
	LEvent.bind( node, "computeVisibility", this.updateOrientation, this);
}

LookAt.prototype.onRemovedFromNode = function(node)
{
	LEvent.unbind( node, "computeVisibility", this.updateOrientation, this);
}


LookAt.prototype.updateOrientation = function(e)
{
	if(!this.enabled)
		return;

	if(!this._root || !this._root.transform ) 
		return;
	var scene = this._root.scene;

	var transform = this._root.transform;


	var target_position = null;
	var up = null;
	var position = transform.getGlobalPosition();

	switch( this.up )
	{
		case LookAt.NEGX: up = vec3.fromValues(-1,0,0); break;
		case LookAt.POSX: up = vec3.fromValues(1,0,0); break;
		case LookAt.NEGZ: up = vec3.fromValues(0,0,-1); break;
		case LookAt.POSZ: up = vec3.fromValues(0,0,1); break;
		case LookAt.NEGY: up = vec3.fromValues(0,-1,0); break;
		case LookAt.POSY: 
		default:
			up = vec3.fromValues(0,1,0);
	}

	if( this.node_id )
	{
		var node = scene.getNode( this.node_id );
		if(!node || node == this._root ) //avoid same node
			return;
		target_position = node.transform.getGlobalPosition( this._target_position );
	}
	else if( this.face_camera )
	{
		var camera = LS.Renderer._main_camera ||  LS.Renderer._current_camera;
		if(camera)
			target_position = camera.getEye();
	}
	else
		return;




	// Get lookAt quaternion
	transform.lookAt( position, target_position, up, true );

	// Fix the front vector
	switch( this.front )
	{
		case LookAt.POSY: quat.rotateX( transform._rotation, transform._rotation, Math.PI * -0.5 );	break;
		case LookAt.NEGY: quat.rotateX( transform._rotation, transform._rotation, Math.PI * 0.5 );	break;
		case LookAt.POSX: quat.rotateY( transform._rotation, transform._rotation, Math.PI * 0.5 );	break;
		case LookAt.NEGX: quat.rotateY( transform._rotation, transform._rotation, Math.PI * -0.5 );	break;
		case LookAt.POSZ: quat.rotateY( transform._rotation, transform._rotation, Math.PI );	break;
		case LookAt.NEGZ:
		default:
	}



	// Influence: Interpolate (spherical) between lookAt quaternion and neutral rotation quaternion
	quat.set(this._quat, 0, 0, 0, 1);
	quat.slerp(transform._rotation, this._quat, transform._rotation, this.influence);



	// Lock axis and rotation limits
	quat.toEuler(this._vec, transform._rotation);

	// Rotation limits
	if (this.lim_horizontal){
		// Min horizontal
		if (this._vec[0] < this.limit_horizontal[0] * DEG2RAD)
			this._vec[0] = this.limit_horizontal[0] * DEG2RAD;
		// Max horizontal
		if (this._vec[0] > this.limit_horizontal[1] * DEG2RAD)
			this._vec[0] = this.limit_horizontal[1] * DEG2RAD;
	}


	if (this.lim_vertical){
		// Min vertical
		if (this._vec[2] < this.limit_vertical[0] * DEG2RAD)
			this._vec[2] = this.limit_vertical[0] * DEG2RAD;
		// Max vertical
		if (this._vec[2] > this.limit_vertical[1] * DEG2RAD)
			this._vec[2] = this.limit_vertical[1] * DEG2RAD;
	}


	// Lock Axis
	if (this.lock_to_axis == LookAt.VERTICAL)
		this._vec[0] = 0;
	if (this.lock_to_axis == LookAt.HORIZONTAL)
		this._vec[2] = 0;

	quat.fromEuler(transform._rotation, this._vec);

	



	// Transform inital rotation euler to quaternion and apply inital rotation
	var initRot = this.initial_rotation;
	quat.fromEuler(this._quat, vec3.fromValues(initRot[1]*DEG2RAD, initRot[2]*DEG2RAD, initRot[0]*DEG2RAD));
	quat.multiply(transform._rotation, transform._rotation, this._quat);
}



LS.registerComponent( LookAt );